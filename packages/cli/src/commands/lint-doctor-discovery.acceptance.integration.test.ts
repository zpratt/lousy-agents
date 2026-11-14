import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { type LintResult, runLint } from "@lousy-agents/lint";
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
const silentLogger = { warn(): void {} };

const ROOT_CLAUDE = "CLAUDE.md";
const ROOT_AGENTS = "AGENTS.md";
const ROOT_OVERRIDE = "AGENTS.override.md";
const NESTED_CLAUDE = "packages/foo/CLAUDE.md";
const NESTED_GUIDE = "packages/foo/guide.md";
const NESTED_AGENTS = "packages/bar/AGENTS.md";
const CLAUDE_DIR = ".claude/CLAUDE.md";
const COPILOT_ROOT = ".github/copilot-instructions.md";
const SCOPED = ".github/instructions/rules.instructions.md";
const SCOPED_NESTED = ".github/instructions/nested/extra.instructions.md";
const INSTRUCTIONS_CLAUDE = ".github/instructions/CLAUDE.md";
const INSTRUCTIONS_NESTED_CLAUDE = ".github/instructions/nested/CLAUDE.md";
const INSTRUCTIONS_AGENTS = ".github/instructions/AGENTS.md";
const INSTRUCTIONS_README = ".github/instructions/README.md";
const AT_LIMIT = instructionAtDepth(10, "at-limit.instructions.md");
const PAST_LIMIT = instructionAtDepth(11, "past-limit.instructions.md");
const DIST_INSTRUCTION = ".github/instructions/dist/generated.instructions.md";
const FIXTURE_INSTRUCTION =
    ".github/instructions/tests/fixtures/trap.instructions.md";
const NODE_MODULES_INSTRUCTION =
    ".github/instructions/node_modules/pkg/hidden.instructions.md";
const AGENT = ".github/agents/reviewer.md";
const AGENT_CLAUDE = ".github/agents/CLAUDE.md";
const AGENT_NESTED = ".github/agents/team/reviewer.md";
const FIXTURE_AGENT = ".github/agents/testdata/trap.md";
const SUBAGENT = ".claude/agents/helper.md";
const COMMAND = ".claude/commands/deploy.md";
const SKILL_GITHUB = ".github/skills/demo/SKILL.md";
const SKILL_CLAUDE = ".claude/skills/demo/SKILL.md";
const SKILL_AGENTS = ".agents/skills/demo/SKILL.md";
const SKILL_PI = ".pi/skills/demo/SKILL.md";
const SKILL_PROMPT = ".pi/prompts/demo/SKILL.md";
const SKILL_DIST = ".github/skills/dist/SKILL.md";
const FIXTURE_SKILL = ".github/skills/__fixtures__/SKILL.md";
const SKILL_DIR_AGENTS = ".claude/skills/example/AGENTS.md";
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
const NESTED_IMPORT = "@./guide.md\n";
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
const FULL_TARGETS = {
    skills: true,
    agents: true,
    subagents: true,
    hooks: true,
    instructions: true,
    mcpServers: true,
} as const;
const INTENTIONAL_DOCTOR_ONLY = new Set([COMMAND, SKILL_DIR_AGENTS]);
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
    AGENT_NESTED,
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
    PAST_LIMIT,
] as const;
const VISIBLE_FIXTURE_LAYOUTS = [
    SRC_FIXTURES,
    TEST_FIXTURES,
    SPEC_FIXTURES,
    TESTS_UNIT_FIXTURES,
] as const;
const RESERVED_SERVER_NAMES = [
    "__proto__",
    "constructor",
    "prototype",
] as const;

function instructionAtDepth(levels: number, fileName: string): string {
    const segments = Array.from({ length: levels }, (_, index) =>
        String(index + 1),
    );
    return [".github/instructions", ...segments, fileName].join("/");
}

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

interface DoctorFinding {
    readonly criterionId: string;
    readonly description: string;
    readonly targetId: string;
    readonly severity: string;
    readonly classification: string;
}

interface DoctorReport {
    readonly inventory: InventoryItem[];
    readonly findings: readonly DoctorFinding[];
}

interface LintDiagnosticJson {
    readonly filePath: string;
    readonly severity: string;
    readonly ruleId?: string;
    readonly target: string;
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

function relativePosix(root: string, filePath: string): string {
    return relative(root, filePath).split(sep).join("/");
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

async function makeRoot(label: string): Promise<string> {
    return realpath(
        await mkdtemp(join(tmpdir(), `lint-doctor-${label}-${chance.guid()}`)),
    );
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
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
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

async function runDoctor(
    repoDir: string,
): Promise<{ exitCode: number; report: DoctorReport }> {
    const result = await runCli(repoDir, [
        "doctor",
        "--format",
        "json",
        "--ci",
    ]);
    return {
        exitCode: result.exitCode,
        report: JSON.parse(result.stdout) as DoctorReport,
    };
}

function parseDiagnostics(stdout: string): LintDiagnosticJson[] {
    const trimmed = stdout.trim();
    if (trimmed === "") {
        return [];
    }
    return JSON.parse(trimmed) as LintDiagnosticJson[];
}

function instructionFormat(
    result: LintResult,
    root: string,
    relativePath: string,
): string | undefined {
    const output = result.outputs.find((item) => item.target === "instruction");
    return output?.qualityResult?.discoveredFiles.find(
        (file) => relativePosix(root, file.filePath) === relativePath,
    )?.format;
}

function analyzedPaths(
    result: LintResult,
    root: string,
    target: LintResult["outputs"][number]["target"],
): string[] {
    const output = result.outputs.find((item) => item.target === target);
    return (output?.filesAnalyzed ?? []).map((filePath) =>
        relativePosix(root, filePath),
    );
}

function allAnalyzed(result: LintResult, root: string): string[] {
    return [
        ...new Set(
            result.outputs.flatMap((output) =>
                output.filesAnalyzed.map((filePath) =>
                    relativePosix(root, filePath),
                ),
            ),
        ),
    ].sort();
}

function resolvedImports(
    result: LintResult,
    root: string,
    relativePath: string,
): string[] | undefined {
    const output = result.outputs.find((item) => item.target === "instruction");
    const document = output?.qualityResult?.effectiveDocuments?.find(
        (item) => relativePosix(root, item.effectiveRoot) === relativePath,
    );
    return document?.resolvedImports.map((filePath) =>
        relativePosix(root, filePath),
    );
}

function harnessOf(
    inventory: readonly InventoryItem[],
    relativePath: string,
): string | undefined {
    return inventory.find((item) => item.path === relativePath)?.harness;
}

function constructOf(
    inventory: readonly InventoryItem[],
    relativePath: string,
): string | undefined {
    return inventory.find((item) => item.path === relativePath)?.constructType;
}

function sortedPaths(inventory: readonly InventoryItem[]): string[] {
    return [...new Set(inventory.map((item) => item.path))].sort();
}

function blockingFinding(
    report: DoctorReport,
    relativePath: string,
): DoctorFinding | undefined {
    return report.findings.find(
        (finding) =>
            (finding.severity === "high" || finding.severity === "critical") &&
            finding.classification === "defect" &&
            (finding.description.includes(relativePath) ||
                finding.targetId.includes(relativePath)),
    );
}

describe("lint and doctor discovery", () => {
    describe("when the repository contains the layouts both tools are asked to see", () => {
        let root: string;
        let full: LintResult;
        let defaults: LintResult;
        let inventory: InventoryItem[];

        beforeAll(async () => {
            root = await makeRoot("layout");
            await writeRepo(root, {
                [ROOT_CLAUDE]: INSTRUCTION,
                [ROOT_AGENTS]: INSTRUCTION,
                [ROOT_OVERRIDE]: INSTRUCTION,
                [NESTED_CLAUDE]: NESTED_IMPORT,
                [NESTED_GUIDE]: "# Guide\n",
                [NESTED_AGENTS]: INSTRUCTION,
                [CLAUDE_DIR]: INSTRUCTION,
                [COPILOT_ROOT]: INSTRUCTION,
                [SCOPED]: INSTRUCTION,
                [SCOPED_NESTED]: INSTRUCTION,
                [INSTRUCTIONS_CLAUDE]: INSTRUCTION,
                [INSTRUCTIONS_NESTED_CLAUDE]: INSTRUCTION,
                [INSTRUCTIONS_AGENTS]: INSTRUCTION,
                [INSTRUCTIONS_README]: INSTRUCTION,
                [AT_LIMIT]: INSTRUCTION,
                [PAST_LIMIT]: INSTRUCTION,
                [DIST_INSTRUCTION]: INSTRUCTION,
                [FIXTURE_INSTRUCTION]: INSTRUCTION,
                [NODE_MODULES_INSTRUCTION]: INSTRUCTION,
                [AGENT]: agentBody("reviewer"),
                [AGENT_CLAUDE]: INSTRUCTION,
                [AGENT_NESTED]: agentBody("reviewer"),
                [FIXTURE_AGENT]: INSTRUCTION,
                [SUBAGENT]: agentBody("helper"),
                [COMMAND]: INSTRUCTION,
                [SKILL_GITHUB]: skillBody("demo"),
                [SKILL_CLAUDE]: skillBody("demo"),
                [SKILL_AGENTS]: skillBody("demo"),
                [SKILL_PI]: skillBody("demo"),
                [SKILL_PROMPT]: skillBody("demo"),
                [SKILL_DIST]: skillBody("dist"),
                [FIXTURE_SKILL]: skillBody("trap"),
                [SKILL_DIR_AGENTS]: INSTRUCTION,
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
            });
            const [lintFull, lintDefault, doctor] = await Promise.all([
                runLint({
                    directory: root,
                    targets: FULL_TARGETS,
                    logger: silentLogger,
                }),
                runLint({ directory: root, logger: silentLogger }),
                runDoctor(root),
            ]);
            full = lintFull;
            defaults = lintDefault;
            inventory = doctor.report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it("should discover the root instruction files, skills, agents, hooks, and MCP configs in both tools", () => {
            const lintPaths = allAnalyzed(full, root);
            const doctorPaths = sortedPaths(inventory);

            expect(
                SHARED_PATHS.map((path) => ({
                    path,
                    lint: lintPaths.includes(path),
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

        it("should record .github/agents/CLAUDE.md as a copilot-agent instruction and as a copilot agent", () => {
            expect(instructionFormat(full, root, AGENT_CLAUDE)).toBe(
                "copilot-agent",
            );
            expect(analyzedPaths(full, root, "instruction")).toContain(
                AGENT_CLAUDE,
            );
            expect(analyzedPaths(full, root, "agent")).toContain(AGENT_CLAUDE);
            expect(harnessOf(inventory, AGENT_CLAUDE)).toBe("copilot");
            expect(constructOf(inventory, AGENT_CLAUDE)).toBe("agent");
        });

        it("should keep a nested agent file an agent and not an instruction", () => {
            expect(instructionFormat(full, root, AGENT_NESTED)).toBeUndefined();
            expect(analyzedPaths(full, root, "agent")).toContain(AGENT_NESTED);
            expect(constructOf(inventory, AGENT_NESTED)).toBe("agent");
            expect(harnessOf(inventory, AGENT_NESTED)).toBe("copilot");
        });

        it("should inventory AGENTS.md inside a skill directory as a skill and not as an agents-md instruction", () => {
            expect(
                instructionFormat(full, root, SKILL_DIR_AGENTS),
            ).toBeUndefined();
            expect(analyzedPaths(full, root, "skill")).not.toContain(
                SKILL_DIR_AGENTS,
            );
            expect(constructOf(inventory, SKILL_DIR_AGENTS)).toBe("skill");
            expect(harnessOf(inventory, SKILL_DIR_AGENTS)).toBe("claude");
        });

        it("should inventory nested CLAUDE.md and AGENTS.md", () => {
            expect(harnessOf(inventory, NESTED_CLAUDE)).toBe("claude");
            expect(constructOf(inventory, NESTED_CLAUDE)).toBe("instruction");
            expect(harnessOf(inventory, NESTED_AGENTS)).toBe("shared");
            expect(constructOf(inventory, NESTED_AGENTS)).toBe("instruction");
        });

        it.fails("should discover a nested CLAUDE.md and a nested AGENTS.md when lint analyzes the repository", () => {
            expect(instructionFormat(full, root, NESTED_CLAUDE)).toBe(
                "claude-md",
            );
            expect(instructionFormat(full, root, NESTED_AGENTS)).toBe(
                "agents-md",
            );
            expect(analyzedPaths(full, root, "instruction")).toEqual(
                expect.arrayContaining([NESTED_CLAUDE, NESTED_AGENTS]),
            );
        });

        it.fails("should resolve an @ import written in a nested CLAUDE.md", () => {
            expect(resolvedImports(full, root, NESTED_CLAUDE)).toEqual([
                NESTED_GUIDE,
            ]);
        });

        it("should attribute CLAUDE.md and AGENTS.md inside .github/instructions to claude and shared", () => {
            expect(harnessOf(inventory, INSTRUCTIONS_CLAUDE)).toBe("claude");
            expect(harnessOf(inventory, INSTRUCTIONS_NESTED_CLAUDE)).toBe(
                "claude",
            );
            expect(harnessOf(inventory, INSTRUCTIONS_AGENTS)).toBe("shared");
            expect(constructOf(inventory, INSTRUCTIONS_README)).toBeUndefined();
        });

        it.fails("should treat CLAUDE.md and AGENTS.md inside .github/instructions as Claude and shared instructions", () => {
            expect(instructionFormat(full, root, INSTRUCTIONS_CLAUDE)).toBe(
                "claude-md",
            );
            expect(
                instructionFormat(full, root, INSTRUCTIONS_NESTED_CLAUDE),
            ).toBe("claude-md");
            expect(instructionFormat(full, root, INSTRUCTIONS_AGENTS)).toBe(
                "agents-md",
            );
            expect(analyzedPaths(full, root, "instruction")).toEqual(
                expect.arrayContaining([
                    INSTRUCTIONS_CLAUDE,
                    INSTRUCTIONS_NESTED_CLAUDE,
                    INSTRUCTIONS_AGENTS,
                ]),
            );
        });

        it("should leave fixture copies out of the doctor inventory", () => {
            const doctorPaths = sortedPaths(inventory);

            expect(doctorPaths.includes(FIXTURE_INSTRUCTION)).toBe(false);
            expect(doctorPaths.includes(FIXTURE_AGENT)).toBe(false);
            expect(doctorPaths.includes(FIXTURE_SKILL)).toBe(false);
        });

        it.fails("should leave fixture copies inside instruction, agent, and skill roots out of lint", () => {
            expect(analyzedPaths(full, root, "instruction")).not.toContain(
                FIXTURE_INSTRUCTION,
            );
            expect(analyzedPaths(full, root, "agent")).not.toContain(
                FIXTURE_AGENT,
            );
            expect(analyzedPaths(full, root, "skill")).not.toContain(
                FIXTURE_SKILL,
            );
        });

        it("should leave tests/fixtures, __fixtures__, testdata, node_modules, dist, a past-limit instruction, and a non-instruction README out of both tools", () => {
            const lintPaths = allAnalyzed(full, root);
            const doctorPaths = sortedPaths(inventory);

            expect(
                EXCLUDED_PATHS.map((path) => ({
                    path,
                    lint: lintPaths.includes(path),
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

        it("should inventory CLAUDE.md under src/fixtures, test/fixtures, spec/fixtures, and tests/unit/fixtures", () => {
            const doctorPaths = sortedPaths(inventory);

            expect(doctorPaths).toEqual(
                expect.arrayContaining([...VISIBLE_FIXTURE_LAYOUTS]),
            );
        });

        it.fails("should keep CLAUDE.md under src/fixtures, test/fixtures, spec/fixtures, and tests/unit/fixtures", () => {
            expect(analyzedPaths(full, root, "instruction")).toEqual(
                expect.arrayContaining(
                    VISIBLE_FIXTURE_LAYOUTS.map((path) => path),
                ),
            );
            expect(instructionFormat(full, root, SRC_FIXTURES)).toBe(
                "claude-md",
            );
        });

        it.fails("should discover an instruction file exactly ten directories below .github/instructions in both tools", () => {
            expect(analyzedPaths(full, root, "instruction")).toContain(
                AT_LIMIT,
            );
            expect(instructionFormat(full, root, AT_LIMIT)).toBe(
                "copilot-scoped",
            );
            expect(sortedPaths(inventory)).toContain(AT_LIMIT);
        });

        it.fails("should leave a generated instruction file inside a dist directory out of both tools", () => {
            expect(analyzedPaths(full, root, "instruction")).not.toContain(
                DIST_INSTRUCTION,
            );
            expect(sortedPaths(inventory)).not.toContain(DIST_INSTRUCTION);
        });

        it.fails("should leave a skill directory named dist out of both tools", () => {
            expect(analyzedPaths(full, root, "skill")).not.toContain(
                SKILL_DIST,
            );
            expect(sortedPaths(inventory)).not.toContain(SKILL_DIST);
        });

        it.fails("should discover the same agentic paths with lint and with doctor", () => {
            const doctorPaths = sortedPaths(inventory).filter(
                (path) => !INTENTIONAL_DOCTOR_ONLY.has(path),
            );
            const lintPaths = allAnalyzed(full, root).filter(
                (path) => !INTENTIONAL_DOCTOR_ONLY.has(path),
            );

            expect(lintPaths).toEqual(doctorPaths);
        });

        it("should leave subagents and MCP configs out of a default lint run", () => {
            expect(analyzedPaths(defaults, root, "subagent")).not.toContain(
                SUBAGENT,
            );
            expect(analyzedPaths(defaults, root, "mcp-server")).not.toContain(
                MCP,
            );
            expect(analyzedPaths(full, root, "subagent")).toContain(SUBAGENT);
            expect(analyzedPaths(full, root, "mcp-server")).toContain(MCP);
        });

        it("should inventory a Claude command and leave it out of lint", () => {
            expect(sortedPaths(inventory)).toContain(COMMAND);
            expect(allAnalyzed(full, root)).not.toContain(COMMAND);
        });
    });

    describe("when AGENTS.MD is the only agents spelling in the repository", () => {
        let root: string;
        let full: LintResult;
        let inventory: InventoryItem[];
        const rootCaps = "AGENTS.MD";
        const nestedCaps = "packages/foo/AGENTS.MD";

        beforeAll(async () => {
            root = await makeRoot("agents-md-caps");
            await writeRepo(root, {
                [rootCaps]: INSTRUCTION,
                [nestedCaps]: INSTRUCTION,
            });
            const [lintFull, doctor] = await Promise.all([
                runLint({
                    directory: root,
                    targets: { instructions: true },
                    logger: silentLogger,
                }),
                runDoctor(root),
            ]);
            full = lintFull;
            inventory = doctor.report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it("should inventory root and nested AGENTS.MD as shared instructions", () => {
            expect(harnessOf(inventory, rootCaps)).toBe("shared");
            expect(harnessOf(inventory, nestedCaps)).toBe("shared");
        });

        it.fails("should discover root and nested AGENTS.MD as agents-md instructions", () => {
            expect(instructionFormat(full, root, rootCaps)).toBe("agents-md");
            expect(instructionFormat(full, root, nestedCaps)).toBe("agents-md");
            expect(analyzedPaths(full, root, "instruction")).toEqual(
                expect.arrayContaining([rootCaps, nestedCaps]),
            );
        });
    });

    describe("when agents.md is the only agents spelling in the repository", () => {
        let root: string;
        let full: LintResult;
        let inventory: InventoryItem[];
        const rootLower = "agents.md";
        const nestedLower = "packages/foo/agents.md";

        beforeAll(async () => {
            root = await makeRoot("agents-md-lower");
            await writeRepo(root, {
                [rootLower]: INSTRUCTION,
                [nestedLower]: INSTRUCTION,
            });
            const [lintFull, doctor] = await Promise.all([
                runLint({
                    directory: root,
                    targets: { instructions: true },
                    logger: silentLogger,
                }),
                runDoctor(root),
            ]);
            full = lintFull;
            inventory = doctor.report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it("should inventory root and nested agents.md as shared instructions", () => {
            expect(harnessOf(inventory, rootLower)).toBe("shared");
            expect(harnessOf(inventory, nestedLower)).toBe("shared");
        });

        it.fails("should discover root and nested agents.md as agents-md instructions", () => {
            expect(instructionFormat(full, root, rootLower)).toBe("agents-md");
            expect(instructionFormat(full, root, nestedLower)).toBe(
                "agents-md",
            );
            expect(analyzedPaths(full, root, "instruction")).toEqual(
                expect.arrayContaining([rootLower, nestedLower]),
            );
        });
    });

    describe("when the scan root is a directory named tests", () => {
        let root: string;
        let full: LintResult;
        let inventory: InventoryItem[];
        const kept = "src/CLAUDE.md";
        const skipped = "fixtures/case/CLAUDE.md";

        beforeAll(async () => {
            const parent = await makeRoot("tests-root");
            root = join(parent, "tests");
            await writeRepo(root, {
                [kept]: INSTRUCTION,
                [skipped]: INSTRUCTION,
            });
            root = await realpath(root);
            const [lintFull, doctor] = await Promise.all([
                runLint({
                    directory: root,
                    targets: { instructions: true },
                    logger: silentLogger,
                }),
                runDoctor(root),
            ]);
            full = lintFull;
            inventory = doctor.report.inventory;
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
            expect(instructionFormat(full, root, kept)).toBe("claude-md");
            expect(analyzedPaths(full, root, "instruction")).not.toContain(
                skipped,
            );
        });
    });

    describe("when the scan root is tests/fixtures", () => {
        let root: string;
        let full: LintResult;
        let inventory: InventoryItem[];
        const rootClaude = "CLAUDE.md";
        const nested = "case/CLAUDE.md";

        beforeAll(async () => {
            const parent = await makeRoot("fixture-root");
            root = join(parent, "tests", "fixtures");
            await writeRepo(root, {
                [rootClaude]: INSTRUCTION,
                [nested]: INSTRUCTION,
            });
            root = await realpath(root);
            const [lintFull, doctor] = await Promise.all([
                runLint({
                    directory: root,
                    targets: { instructions: true },
                    logger: silentLogger,
                }),
                runDoctor(root),
            ]);
            full = lintFull;
            inventory = doctor.report.inventory;
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
            expect(instructionFormat(full, root, rootClaude)).toBe("claude-md");
            expect(instructionFormat(full, root, nested)).toBe("claude-md");
        });
    });

    describe("when skills-lock.json names one skill", () => {
        let root: string;
        let full: LintResult;
        let inventory: InventoryItem[];
        const locked = ".github/skills/locked-skill/SKILL.md";
        const kept = ".github/skills/kept-skill/SKILL.md";

        beforeAll(async () => {
            root = await makeRoot("lock");
            await writeRepo(root, {
                [locked]: skillBody("locked-skill"),
                [kept]: skillBody("kept-skill"),
                "skills-lock.json": JSON.stringify({
                    skills: { "locked-skill": { source: "test" } },
                }),
            });
            const [lintFull, doctor] = await Promise.all([
                runLint({
                    directory: root,
                    targets: { skills: true },
                    logger: silentLogger,
                }),
                runDoctor(root),
            ]);
            full = lintFull;
            inventory = doctor.report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it("should omit the locked skill from lint and still inventory it in doctor", () => {
            expect(analyzedPaths(full, root, "skill")).not.toContain(locked);
            expect(analyzedPaths(full, root, "skill")).toContain(kept);
            expect(sortedPaths(inventory)).toEqual(
                expect.arrayContaining([locked, kept]),
            );
        });
    });

    describe("when the Copilot hook file has no preToolUse key", () => {
        let root: string;
        let full: LintResult;
        let inventory: InventoryItem[];

        beforeAll(async () => {
            root = await makeRoot("hook");
            await writeRepo(root, {
                [HOOK_COPILOT]: JSON.stringify({
                    version: 1,
                    hooks: {
                        sessionStart: [{ type: "command", bash: "true" }],
                    },
                }),
            });
            const [lintFull, doctor] = await Promise.all([
                runLint({
                    directory: root,
                    targets: { hooks: true },
                    logger: silentLogger,
                }),
                runDoctor(root),
            ]);
            full = lintFull;
            inventory = doctor.report.inventory;
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it("should leave the hook file out of lint and inventory it in doctor", () => {
            expect(analyzedPaths(full, root, "hook")).not.toContain(
                HOOK_COPILOT,
            );
            expect(sortedPaths(inventory)).toContain(HOOK_COPILOT);
        });
    });

    describe("when an MCP config cannot be read as servers", () => {
        const malformed = "{ not valid json";
        const schemaInvalid = JSON.stringify({ mcpServers: [] });

        async function assertLintReports(
            relativePath: string,
            content: string,
            ruleId: string,
        ): Promise<void> {
            const repo = await makeRoot("mcp-lint");
            try {
                await writeRepo(repo, { [relativePath]: content });
                const flagged = await runCli(repo, [
                    "lint",
                    "--mcp-servers",
                    "--format",
                    "json",
                ]);
                const diagnostics = parseDiagnostics(flagged.stdout);

                expect(flagged.exitCode).toBe(1);
                expect(diagnostics).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            filePath: absolutePath(repo, relativePath),
                            ruleId,
                            severity: "error",
                            target: "mcp-server",
                        }),
                    ]),
                );
            } finally {
                await rm(repo, { recursive: true, force: true });
            }
        }

        async function assertDoctorBlocks(
            relativePath: string,
            content: string,
        ): Promise<void> {
            const repo = await makeRoot("mcp-doctor");
            try {
                await writeRepo(repo, { [relativePath]: content });
                const doctor = await runDoctor(repo);

                expect(doctor.exitCode).toBe(1);
                expect(blockingFinding(doctor.report, relativePath)).toEqual(
                    expect.objectContaining({
                        severity: expect.stringMatching(/^(high|critical)$/),
                        classification: "defect",
                    }),
                );
            } finally {
                await rm(repo, { recursive: true, force: true });
            }
        }

        it("should report malformed .mcp.json from lint and ignore it on a default lint run", async () => {
            const repo = await makeRoot("mcp-default");
            try {
                await writeRepo(repo, { [MCP]: malformed });
                const flagged = await runCli(repo, [
                    "lint",
                    "--mcp-servers",
                    "--format",
                    "json",
                ]);
                const plain = await runCli(repo, ["lint", "--format", "json"]);

                expect(flagged.exitCode).toBe(1);
                expect(parseDiagnostics(flagged.stdout)).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            filePath: absolutePath(repo, MCP),
                            ruleId: "mcpserver/invalid-json",
                        }),
                    ]),
                );
                expect(plain.exitCode).toBe(0);
                expect(
                    parseDiagnostics(plain.stdout).some(
                        (diagnostic) => diagnostic.target === "mcp-server",
                    ),
                ).toBe(false);
            } finally {
                await rm(repo, { recursive: true, force: true });
            }
        });

        it("should report malformed .vscode/mcp.json from lint", async () => {
            await expect(
                assertLintReports(
                    MCP_VSCODE,
                    malformed,
                    "mcpserver/invalid-json",
                ),
            ).resolves.toBeUndefined();
        });

        it("should report MCP JSON that parses but fails the schema from lint", async () => {
            await expect(
                assertLintReports(
                    MCP,
                    schemaInvalid,
                    "mcpserver/invalid-config",
                ),
            ).resolves.toBeUndefined();
        });

        it.each(RESERVED_SERVER_NAMES)(
            "should report a reserved MCP server name %s from lint",
            async (name) => {
                await expect(
                    assertLintReports(
                        MCP,
                        `{ "mcpServers": { "${name}": { "command": "true" } } }`,
                        "mcpserver/invalid-config",
                    ),
                ).resolves.toBeUndefined();
            },
        );

        it.fails("should fail doctor --ci when .mcp.json is not valid JSON", async () => {
            await expect(
                assertDoctorBlocks(MCP, malformed),
            ).resolves.toBeUndefined();
        });

        it.fails("should fail doctor --ci when .vscode/mcp.json is not valid JSON", async () => {
            await expect(
                assertDoctorBlocks(MCP_VSCODE, malformed),
            ).resolves.toBeUndefined();
        });

        it.fails("should fail doctor --ci when MCP JSON parses but fails the schema", async () => {
            await expect(
                assertDoctorBlocks(MCP, schemaInvalid),
            ).resolves.toBeUndefined();
        });

        it.fails.each(RESERVED_SERVER_NAMES)(
            "should fail doctor --ci when .mcp.json names the reserved server %s",
            async (name) => {
                await expect(
                    assertDoctorBlocks(
                        MCP,
                        `{ "mcpServers": { "${name}": { "command": "true" } } }`,
                    ),
                ).resolves.toBeUndefined();
            },
        );
    });

    describe("when instruction/missing-structural-heading is configured as an error", () => {
        let root: string;

        beforeAll(async () => {
            root = await makeRoot("error-severity");
            await writeRepo(root, {
                [NESTED_CLAUDE]: "# Nested only\n",
                ".lousy-agentsrc.json": JSON.stringify({
                    lint: {
                        rules: {
                            instructions: {
                                "instruction/missing-structural-heading":
                                    "error",
                            },
                        },
                    },
                }),
            });
        });

        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        it.fails("should exit 1 when the only broken instruction file is a nested CLAUDE.md", async () => {
            const result = await runCli(root, [
                "lint",
                "--instructions",
                "--format",
                "json",
            ]);
            const diagnostics = parseDiagnostics(result.stdout);

            expect(result.exitCode).toBe(1);
            expect(diagnostics).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        filePath: absolutePath(root, NESTED_CLAUDE),
                        ruleId: "instruction/missing-structural-heading",
                        severity: "error",
                        target: "instruction",
                    }),
                ]),
            );
        });
    });
});
