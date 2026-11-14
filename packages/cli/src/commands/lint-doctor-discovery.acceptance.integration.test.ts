import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const chance = new Chance();
const cliEntry = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "index.ts",
);
const tsxBin = resolve(process.cwd(), "node_modules", ".bin", "tsx");

const ROOT_CLAUDE = "CLAUDE.md";
const ROOT_AGENTS = "AGENTS.md";
const ROOT_OVERRIDE = "AGENTS.override.md";
const ROOT_AGENTS_MD = "AGENTS.MD";
const ROOT_AGENTS_LOWER = "agents.md";
const NESTED_CLAUDE = "packages/foo/CLAUDE.md";
const NESTED_AGENTS = "packages/bar/AGENTS.md";
const NESTED_AGENTS_MD = "packages/foo/AGENTS.MD";
const CLAUDE_DIR = ".claude/CLAUDE.md";
const COPILOT_ROOT = ".github/copilot-instructions.md";
const SCOPED = ".github/instructions/rules.instructions.md";
const SCOPED_NESTED = ".github/instructions/nested/extra.instructions.md";
const INSTRUCTIONS_CLAUDE = ".github/instructions/CLAUDE.md";
const INSTRUCTIONS_AGENTS = ".github/instructions/AGENTS.md";
const INSTRUCTIONS_README = ".github/instructions/README.md";
const DEEP_INSTRUCTION =
    ".github/instructions/1/2/3/4/5/6/7/8/9/deep.instructions.md";
const DIST_INSTRUCTION = ".github/instructions/dist/generated.instructions.md";
const FIXTURE_INSTRUCTION =
    ".github/instructions/tests/fixtures/trap.instructions.md";
const NODE_MODULES_INSTRUCTION =
    ".github/instructions/node_modules/pkg/hidden.instructions.md";
const AGENT = ".github/agents/reviewer.md";
const AGENT_CLAUDE = ".github/agents/CLAUDE.md";
const FIXTURE_AGENT = ".github/agents/testdata/trap.md";
const SUBAGENT = ".claude/agents/helper.md";
const COMMAND = ".claude/commands/deploy.md";
const SKILL_GITHUB = ".github/skills/demo/SKILL.md";
const SKILL_CLAUDE = ".claude/skills/demo/SKILL.md";
const SKILL_AGENTS = ".agents/skills/demo/SKILL.md";
const SKILL_PI = ".pi/skills/demo/SKILL.md";
const SKILL_PROMPT = ".pi/prompts/demo/SKILL.md";
const FIXTURE_SKILL = ".github/skills/__fixtures__/SKILL.md";
const HOOK_COPILOT = ".github/hooks/agent-shell/hooks.json";
const HOOK_CLAUDE = ".claude/settings.json";
const MCP = ".mcp.json";
const MCP_VSCODE = ".vscode/mcp.json";
const SRC_FIXTURES = "src/fixtures/CLAUDE.md";
const TEST_FIXTURES = "test/fixtures/CLAUDE.md";
const SPEC_FIXTURES = "spec/fixtures/CLAUDE.md";
const TESTS_UNIT_FIXTURES = "tests/unit/fixtures/CLAUDE.md";
const TESTS_FIXTURES = "tests/fixtures/case/CLAUDE.md";
const NESTED_TESTS_FIXTURES = "packages/bar/tests/fixtures/case/CLAUDE.md";
const DUNDER_FIXTURES = "pkg/__fixtures__/case/CLAUDE.md";
const TESTDATA_CLAUDE = "testdata/case/CLAUDE.md";
const NODE_MODULES_CLAUDE = "node_modules/left-out/CLAUDE.md";
const DIST_CLAUDE = "dist/CLAUDE.md";

const INSTRUCTION = "# Instructions\n";
const COPILOT_HOOK = JSON.stringify({
    version: 1,
    hooks: { preToolUse: [{ type: "command", bash: "true" }] },
});
const CLAUDE_HOOK = JSON.stringify({ hooks: {} });
const MCP_CLAUDE = JSON.stringify({
    mcpServers: { demo: { command: "true" } },
});
const MCP_COPILOT = JSON.stringify({
    servers: { "vscode-demo": { command: "true" } },
});

const SHARED_PATHS = [
    ROOT_CLAUDE,
    ROOT_AGENTS,
    ROOT_OVERRIDE,
    CLAUDE_DIR,
    COPILOT_ROOT,
    SCOPED,
    SCOPED_NESTED,
    AGENT,
    AGENT_CLAUDE,
    SUBAGENT,
    SKILL_GITHUB,
    SKILL_CLAUDE,
    SKILL_AGENTS,
    SKILL_PI,
    SKILL_PROMPT,
    HOOK_COPILOT,
    HOOK_CLAUDE,
    MCP,
    MCP_VSCODE,
] as const;

const EXCLUDED_PATHS = [
    INSTRUCTIONS_README,
    TESTS_FIXTURES,
    NESTED_TESTS_FIXTURES,
    DUNDER_FIXTURES,
    TESTDATA_CLAUDE,
    NODE_MODULES_CLAUDE,
    DIST_CLAUDE,
    NODE_MODULES_INSTRUCTION,
] as const;

const VISIBLE_FIXTURE_LAYOUTS = [
    SRC_FIXTURES,
    TEST_FIXTURES,
    SPEC_FIXTURES,
    TESTS_UNIT_FIXTURES,
] as const;

interface CommandResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
}

interface InventoryItem {
    readonly path: string;
    readonly harness: string;
    readonly constructType: string;
}

interface DoctorReport {
    readonly inventory: InventoryItem[];
    readonly findings: ReadonlyArray<{
        readonly criterionId: string;
        readonly description: string;
        readonly targetId: string;
    }>;
}

function cliEnvironment(): NodeJS.ProcessEnv {
    const {
        TEST: _test,
        DEBUG: _debug,
        CONSOLA_LEVEL: _level,
        CI: _ci,
        ...env
    } = process.env;
    // biome-ignore lint/style/useNamingConvention: env vars
    return { ...env, NO_COLOR: "1", CONSOLA_LEVEL: "3" };
}

function absolutePath(root: string, relativePath: string): string {
    return join(root, ...relativePath.split("/"));
}

function outputMentions(
    output: string,
    root: string,
    relativePath: string,
): boolean {
    return output.includes(absolutePath(root, relativePath));
}

function formatMention(
    output: string,
    root: string,
    relativePath: string,
    format: string,
): boolean {
    return output.includes(`${absolutePath(root, relativePath)} (${format})`);
}

function skillBody(name: string): string {
    return [
        "---",
        `name: ${name}`,
        "description: A skill used to prove discovery",
        "---",
        "",
        `# ${name}`,
        "",
    ].join("\n");
}

function agentBody(name: string): string {
    return [
        "---",
        `name: ${name}`,
        "description: An agent used to prove discovery",
        "---",
        "",
        `# ${name}`,
        "",
    ].join("\n");
}

async function writeRepo(
    root: string,
    files: Readonly<Record<string, string>>,
): Promise<void> {
    await mkdir(root, { recursive: true });
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = absolutePath(root, relativePath);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content);
    }
}

async function runCli(
    repoDir: string,
    args: readonly string[],
): Promise<CommandResult> {
    try {
        const result = await execFileAsync(tsxBin, [cliEntry, ...args], {
            cwd: repoDir,
            env: cliEnvironment(),
        });
        return {
            exitCode: 0,
            stdout: result.stdout,
            stderr: result.stderr,
        };
    } catch (error: unknown) {
        const failed = error as {
            code?: number;
            stdout?: string;
            stderr?: string;
        };
        return {
            exitCode: failed.code ?? 1,
            stdout: failed.stdout ?? "",
            stderr: failed.stderr ?? "",
        };
    }
}

function combined(result: CommandResult): string {
    return `${result.stdout}\n${result.stderr}`;
}

async function lintAll(repoDir: string): Promise<CommandResult> {
    return runCli(repoDir, [
        "lint",
        "--skills",
        "--agents",
        "--subagents",
        "--hooks",
        "--instructions",
        "--mcp-servers",
    ]);
}

async function doctorReport(repoDir: string): Promise<DoctorReport> {
    const result = await runCli(repoDir, [
        "doctor",
        "--format",
        "json",
        "--ci",
    ]);
    return JSON.parse(result.stdout) as DoctorReport;
}

function harnessOf(
    inventory: readonly InventoryItem[],
    relativePath: string,
): string | undefined {
    return inventory.find((item) => item.path === relativePath)?.harness;
}

function sortedPaths(inventory: readonly InventoryItem[]): string[] {
    return [...new Set(inventory.map((item) => item.path))].sort();
}

function lintPaths(
    output: string,
    root: string,
    candidates: readonly string[],
): string[] {
    return candidates.filter((path) => outputMentions(output, root, path));
}

describe("lint and doctor discovery", () => {
    describe("when the repository contains the layouts both tools are asked to see", () => {
        let root: string;
        let lintOutput: string;
        let defaultLintOutput: string;
        let inventory: InventoryItem[];
        const files: Record<string, string> = {
            [ROOT_CLAUDE]: INSTRUCTION,
            [ROOT_AGENTS]: INSTRUCTION,
            [ROOT_OVERRIDE]: INSTRUCTION,
            [ROOT_AGENTS_MD]: INSTRUCTION,
            [ROOT_AGENTS_LOWER]: INSTRUCTION,
            [NESTED_CLAUDE]: INSTRUCTION,
            [NESTED_AGENTS]: INSTRUCTION,
            [NESTED_AGENTS_MD]: INSTRUCTION,
            [CLAUDE_DIR]: INSTRUCTION,
            [COPILOT_ROOT]: INSTRUCTION,
            [SCOPED]: INSTRUCTION,
            [SCOPED_NESTED]: INSTRUCTION,
            [INSTRUCTIONS_CLAUDE]: INSTRUCTION,
            [INSTRUCTIONS_AGENTS]: INSTRUCTION,
            [INSTRUCTIONS_README]: INSTRUCTION,
            [DEEP_INSTRUCTION]: INSTRUCTION,
            [DIST_INSTRUCTION]: INSTRUCTION,
            [FIXTURE_INSTRUCTION]: INSTRUCTION,
            [NODE_MODULES_INSTRUCTION]: INSTRUCTION,
            [AGENT]: agentBody("reviewer"),
            [AGENT_CLAUDE]: INSTRUCTION,
            [FIXTURE_AGENT]: INSTRUCTION,
            [SUBAGENT]: agentBody("helper"),
            [COMMAND]: INSTRUCTION,
            [SKILL_GITHUB]: skillBody("demo"),
            [SKILL_CLAUDE]: skillBody("demo"),
            [SKILL_AGENTS]: skillBody("demo"),
            [SKILL_PI]: skillBody("demo"),
            [SKILL_PROMPT]: skillBody("demo"),
            [FIXTURE_SKILL]: skillBody("trap"),
            [HOOK_COPILOT]: COPILOT_HOOK,
            [HOOK_CLAUDE]: CLAUDE_HOOK,
            [MCP]: MCP_CLAUDE,
            [MCP_VSCODE]: MCP_COPILOT,
            [SRC_FIXTURES]: INSTRUCTION,
            [TEST_FIXTURES]: INSTRUCTION,
            [SPEC_FIXTURES]: INSTRUCTION,
            [TESTS_UNIT_FIXTURES]: INSTRUCTION,
            [TESTS_FIXTURES]: INSTRUCTION,
            [NESTED_TESTS_FIXTURES]: INSTRUCTION,
            [DUNDER_FIXTURES]: INSTRUCTION,
            [TESTDATA_CLAUDE]: INSTRUCTION,
            [NODE_MODULES_CLAUDE]: INSTRUCTION,
            [DIST_CLAUDE]: INSTRUCTION,
        };

        beforeAll(async () => {
            root = await mkdtemp(
                join(tmpdir(), `lint-doctor-discovery-${chance.guid()}`),
            );
            await writeRepo(root, files);
            const [full, defaults, report] = await Promise.all([
                lintAll(root),
                runCli(root, ["lint"]),
                doctorReport(root),
            ]);
            lintOutput = combined(full);
            defaultLintOutput = combined(defaults);
            inventory = report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it("should discover the root instruction files, skills, agents, hooks, and MCP configs in both tools", () => {
            const doctorPaths = sortedPaths(inventory);

            expect(
                SHARED_PATHS.map((path) => ({
                    path,
                    lint: outputMentions(lintOutput, root, path),
                    doctor: doctorPaths.includes(path),
                })),
            ).toEqual(
                SHARED_PATHS.map((path) => ({
                    path,
                    lint: true,
                    doctor: true,
                })),
            );
        });

        it.fails("should discover a nested CLAUDE.md and a nested AGENTS.md when lint analyzes the repository", () => {
            expect({
                claude: outputMentions(lintOutput, root, NESTED_CLAUDE),
                agents: outputMentions(lintOutput, root, NESTED_AGENTS),
                doctorClaude: inventory.some(
                    (item) => item.path === NESTED_CLAUDE,
                ),
                doctorAgents: inventory.some(
                    (item) => item.path === NESTED_AGENTS,
                ),
            }).toEqual({
                claude: true,
                agents: true,
                doctorClaude: true,
                doctorAgents: true,
            });
        });

        it.fails("should discover root and nested AGENTS.MD and agents.md as agents-md instructions", () => {
            expect({
                rootCaps: formatMention(
                    lintOutput,
                    root,
                    ROOT_AGENTS_MD,
                    "agents-md",
                ),
                nestedCaps: formatMention(
                    lintOutput,
                    root,
                    NESTED_AGENTS_MD,
                    "agents-md",
                ),
                lower: formatMention(
                    lintOutput,
                    root,
                    ROOT_AGENTS_LOWER,
                    "agents-md",
                ),
                doctorRoot: harnessOf(inventory, ROOT_AGENTS_MD),
                doctorNested: harnessOf(inventory, NESTED_AGENTS_MD),
                doctorLower: harnessOf(inventory, ROOT_AGENTS_LOWER),
            }).toEqual({
                rootCaps: true,
                nestedCaps: true,
                lower: true,
                doctorRoot: "shared",
                doctorNested: "shared",
                doctorLower: "shared",
            });
        });

        it.fails("should treat CLAUDE.md and AGENTS.md inside .github/instructions as Claude and shared instructions", () => {
            expect({
                claude: formatMention(
                    lintOutput,
                    root,
                    INSTRUCTIONS_CLAUDE,
                    "claude-md",
                ),
                agents: formatMention(
                    lintOutput,
                    root,
                    INSTRUCTIONS_AGENTS,
                    "agents-md",
                ),
                doctorClaude: harnessOf(inventory, INSTRUCTIONS_CLAUDE),
                doctorAgents: harnessOf(inventory, INSTRUCTIONS_AGENTS),
                doctorAgentFile: harnessOf(inventory, AGENT_CLAUDE),
            }).toEqual({
                claude: true,
                agents: true,
                doctorClaude: "claude",
                doctorAgents: "shared",
                doctorAgentFile: "copilot",
            });
        });

        it.fails("should leave fixture copies inside instruction, agent, and skill roots out of lint", () => {
            expect({
                instruction: outputMentions(
                    lintOutput,
                    root,
                    FIXTURE_INSTRUCTION,
                ),
                agent: outputMentions(lintOutput, root, FIXTURE_AGENT),
                skill: outputMentions(lintOutput, root, FIXTURE_SKILL),
                doctorInstruction: inventory.some(
                    (item) => item.path === FIXTURE_INSTRUCTION,
                ),
                doctorAgent: inventory.some(
                    (item) => item.path === FIXTURE_AGENT,
                ),
                doctorSkill: inventory.some(
                    (item) => item.path === FIXTURE_SKILL,
                ),
            }).toEqual({
                instruction: false,
                agent: false,
                skill: false,
                doctorInstruction: false,
                doctorAgent: false,
                doctorSkill: false,
            });
        });

        it("should leave tests/fixtures, __fixtures__, testdata, node_modules, dist, and a non-instruction README out of both tools", () => {
            const doctorPaths = sortedPaths(inventory);

            expect(
                EXCLUDED_PATHS.map((path) => ({
                    path,
                    lint: outputMentions(lintOutput, root, path),
                    doctor: doctorPaths.includes(path),
                })),
            ).toEqual(
                EXCLUDED_PATHS.map((path) => ({
                    path,
                    lint: false,
                    doctor: false,
                })),
            );
        });

        it.fails("should keep CLAUDE.md under src/fixtures, test/fixtures, spec/fixtures, and tests/unit/fixtures", () => {
            const doctorPaths = sortedPaths(inventory);

            expect(
                VISIBLE_FIXTURE_LAYOUTS.map((path) => ({
                    path,
                    lint: outputMentions(lintOutput, root, path),
                    doctor: doctorPaths.includes(path),
                })),
            ).toEqual(
                VISIBLE_FIXTURE_LAYOUTS.map((path) => ({
                    path,
                    lint: true,
                    doctor: true,
                })),
            );
        });

        it.fails("should discover an instruction file nine directories below .github/instructions in both tools", () => {
            expect({
                lint: outputMentions(lintOutput, root, DEEP_INSTRUCTION),
                doctor: sortedPaths(inventory).includes(DEEP_INSTRUCTION),
            }).toEqual({ lint: true, doctor: true });
        });

        it.fails("should leave a generated instruction file inside a dist directory out of both tools", () => {
            expect({
                lint: outputMentions(lintOutput, root, DIST_INSTRUCTION),
                doctor: sortedPaths(inventory).includes(DIST_INSTRUCTION),
            }).toEqual({ lint: false, doctor: false });
        });

        it.fails("should discover the same agentic paths with lint and with doctor", () => {
            const doctorPaths = sortedPaths(inventory).filter(
                (path) => path !== COMMAND,
            );
            const candidates = [
                ...new Set([...Object.keys(files), ...doctorPaths]),
            ].filter((path) => path !== COMMAND);

            expect(lintPaths(lintOutput, root, candidates).sort()).toEqual(
                doctorPaths,
            );
        });

        it("should leave subagents and MCP configs out of a default lint run", () => {
            expect({
                subagent: outputMentions(defaultLintOutput, root, SUBAGENT),
                mcp: outputMentions(defaultLintOutput, root, MCP),
                fullSubagent: outputMentions(lintOutput, root, SUBAGENT),
                fullMcp: outputMentions(lintOutput, root, MCP),
            }).toEqual({
                subagent: false,
                mcp: false,
                fullSubagent: true,
                fullMcp: true,
            });
        });

        it("should inventory a Claude command and leave it out of lint", () => {
            const command = inventory.find((item) => item.path === COMMAND);

            expect(command?.constructType).toBe("agent");
            expect(outputMentions(lintOutput, root, COMMAND)).toBe(false);
        });
    });

    describe("when the scan root is a directory named tests", () => {
        let root: string;
        let lintOutput: string;
        let inventory: InventoryItem[];
        const kept = "src/CLAUDE.md";
        const skipped = "fixtures/case/CLAUDE.md";

        beforeAll(async () => {
            const parent = await mkdtemp(
                join(tmpdir(), `lint-doctor-tests-root-${chance.guid()}`),
            );
            root = join(parent, "tests");
            await writeRepo(root, {
                [kept]: INSTRUCTION,
                [skipped]: INSTRUCTION,
            });
            const [lintResult, report] = await Promise.all([
                lintAll(root),
                doctorReport(root),
            ]);
            lintOutput = combined(lintResult);
            inventory = report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(dirname(root), { recursive: true, force: true });
            }
        });

        it("should discover src/CLAUDE.md and skip fixtures when doctor starts in tests", () => {
            expect(sortedPaths(inventory)).toEqual([kept]);
        });

        it.fails("should discover src/CLAUDE.md and skip fixtures when lint starts in tests", () => {
            expect({
                kept: outputMentions(lintOutput, root, kept),
                skipped: outputMentions(lintOutput, root, skipped),
            }).toEqual({ kept: true, skipped: false });
        });
    });

    describe("when the scan root is tests/fixtures", () => {
        let root: string;
        let lintOutput: string;
        let inventory: InventoryItem[];
        const rootClaude = "CLAUDE.md";
        const nested = "case/CLAUDE.md";

        beforeAll(async () => {
            const parent = await mkdtemp(
                join(tmpdir(), `lint-doctor-fixture-root-${chance.guid()}`),
            );
            root = join(parent, "tests", "fixtures");
            await writeRepo(root, {
                [rootClaude]: INSTRUCTION,
                [nested]: INSTRUCTION,
            });
            const [lintResult, report] = await Promise.all([
                lintAll(root),
                doctorReport(root),
            ]);
            lintOutput = combined(lintResult);
            inventory = report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(dirname(dirname(root)), {
                    recursive: true,
                    force: true,
                });
            }
        });

        it("should inventory the fixture tree when doctor is pointed at it", () => {
            expect(sortedPaths(inventory)).toEqual([rootClaude, nested]);
        });

        it.fails("should discover the root and nested CLAUDE.md when lint is pointed at tests/fixtures", () => {
            expect({
                root: outputMentions(lintOutput, root, rootClaude),
                nested: outputMentions(lintOutput, root, nested),
            }).toEqual({ root: true, nested: true });
        });
    });

    describe("when skills-lock.json names one skill", () => {
        let root: string;
        let lintOutput: string;
        let inventory: InventoryItem[];
        const locked = ".github/skills/locked-skill/SKILL.md";
        const kept = ".github/skills/kept-skill/SKILL.md";

        beforeAll(async () => {
            root = await mkdtemp(
                join(tmpdir(), `lint-doctor-lock-${chance.guid()}`),
            );
            await writeRepo(root, {
                [locked]: skillBody("locked-skill"),
                [kept]: skillBody("kept-skill"),
                "skills-lock.json": JSON.stringify({
                    skills: { "locked-skill": { source: "test" } },
                }),
            });
            const [lintResult, report] = await Promise.all([
                lintAll(root),
                doctorReport(root),
            ]);
            lintOutput = combined(lintResult);
            inventory = report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it("should omit the locked skill from lint and still inventory it in doctor", () => {
            expect({
                lintLocked: outputMentions(lintOutput, root, locked),
                lintKept: outputMentions(lintOutput, root, kept),
                doctorLocked: inventory.some((item) => item.path === locked),
                doctorKept: inventory.some((item) => item.path === kept),
            }).toEqual({
                lintLocked: false,
                lintKept: true,
                doctorLocked: true,
                doctorKept: true,
            });
        });
    });

    describe("when the Copilot hook file has no preToolUse key", () => {
        let root: string;
        let lintOutput: string;
        let inventory: InventoryItem[];

        beforeAll(async () => {
            root = await mkdtemp(
                join(tmpdir(), `lint-doctor-hook-${chance.guid()}`),
            );
            await writeRepo(root, {
                [HOOK_COPILOT]: JSON.stringify({
                    version: 1,
                    hooks: {
                        sessionStart: [{ type: "command", bash: "true" }],
                    },
                }),
            });
            const [lintResult, report] = await Promise.all([
                lintAll(root),
                doctorReport(root),
            ]);
            lintOutput = combined(lintResult);
            inventory = report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it("should leave the hook file out of lint and inventory it in doctor", () => {
            expect({
                lint: outputMentions(lintOutput, root, HOOK_COPILOT),
                doctor: inventory.some((item) => item.path === HOOK_COPILOT),
            }).toEqual({ lint: false, doctor: true });
        });
    });

    describe("when .mcp.json is not valid JSON", () => {
        let root: string;
        let lintOutput: string;
        let report: DoctorReport;

        beforeAll(async () => {
            root = await mkdtemp(
                join(tmpdir(), `lint-doctor-mcp-${chance.guid()}`),
            );
            await writeRepo(root, { [MCP]: "{ not valid json" });
            const [lintResult, doctor] = await Promise.all([
                lintAll(root),
                doctorReport(root),
            ]);
            lintOutput = combined(lintResult);
            report = doctor;
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it.fails("should surface the unreadable MCP config from lint and from doctor", () => {
            const doctorNamesIt =
                report.inventory.some((item) => item.path === MCP) ||
                report.findings.some(
                    (finding) =>
                        finding.description.includes(MCP) ||
                        finding.targetId.includes(MCP),
                );

            expect({
                lint: outputMentions(lintOutput, root, MCP),
                doctor: doctorNamesIt,
            }).toEqual({ lint: true, doctor: true });
        });
    });
});
