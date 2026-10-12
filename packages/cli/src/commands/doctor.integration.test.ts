import { execFile } from "node:child_process";
import {
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliBin = resolve(__dirname, "..", "..", "dist", "index.js");
const fixturesDir = resolve(
    __dirname,
    "..",
    "..",
    "..",
    "doctor",
    "tests",
    "fixtures",
);

function fixture(name: string): string {
    return resolve(fixturesDir, name);
}

interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

/**
 * Vitest sets TEST=true, which makes consola silence human output. Drop it so
 * the child process prints what a user's terminal would show.
 */
function userEnvironment(): NodeJS.ProcessEnv {
    const { TEST: _testFlag, ...env } = process.env;
    // biome-ignore lint/style/useNamingConvention: env var
    return { ...env, NO_COLOR: "1" };
}

async function runDoctor(args: string[], cwd: string): Promise<ExecResult> {
    try {
        const result = await execFileAsync(
            process.execPath,
            [cliBin, "doctor", ...args],
            { cwd, env: userEnvironment() },
        );
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (err: unknown) {
        const e = err as { code?: number; stdout?: string; stderr?: string };
        return {
            exitCode: e.code ?? 1,
            stdout: e.stdout ?? "",
            stderr: e.stderr ?? "",
        };
    }
}

describe("doctor command", () => {
    describe("when invoked with --help", () => {
        it("should display usage and exit 0", async () => {
            // Arrange
            const cwd = process.cwd();

            // Act
            const { exitCode, stdout } = await runDoctor(["--help"], cwd);

            // Assert
            expect(exitCode).toBe(0);
            expect(stdout).toMatch(/doctor/i);
            expect(stdout).toMatch(/--summary/);
            expect(stdout).toMatch(/--format/);
        });
    });

    describe("when run with --summary --format json on an empty repo", () => {
        it("should output a valid JSON summary and exit 0", async () => {
            // Arrange
            const cwd = fixture("empty-repo");

            // Act
            const { exitCode, stdout } = await runDoctor(
                ["--summary", "--format", "json"],
                cwd,
            );

            // Assert
            expect(exitCode).toBe(0);
            const report = JSON.parse(stdout) as Record<string, unknown>;
            expect(report).toHaveProperty("archetype", "none");
            expect(report).toHaveProperty("totalRecords", 0);
            expect(report).not.toHaveProperty("findings");
        });

        it("should include an empty inventory array", async () => {
            // Arrange
            const cwd = fixture("empty-repo");

            // Act
            const { stdout } = await runDoctor(
                ["--summary", "--format", "json"],
                cwd,
            );

            // Assert
            const report = JSON.parse(stdout) as { inventory: unknown[] };
            expect(report.inventory).toEqual([]);
        });
    });

    describe("when run with --format json on an empty repo", () => {
        it("should output valid JSON with no findings and exit 0", async () => {
            // Arrange
            const cwd = fixture("empty-repo");

            // Act
            const { exitCode, stdout } = await runDoctor(
                ["--format", "json"],
                cwd,
            );

            // Assert
            expect(exitCode).toBe(0);
            const report = JSON.parse(stdout) as {
                archetype: string;
                findings: unknown[];
            };
            expect(report.archetype).toBe("none");
            expect(report.findings).toHaveLength(0);
        });

        it("should include empty inventory and edges arrays", async () => {
            // Arrange
            const cwd = fixture("empty-repo");

            // Act
            const { stdout } = await runDoctor(["--format", "json"], cwd);

            // Assert
            const report = JSON.parse(stdout) as {
                inventory: unknown[];
                edges: unknown[];
            };
            expect(report.inventory).toEqual([]);
            expect(report.edges).toEqual([]);
        });
    });

    describe("when run with --format json on the integration-scenario fixture", () => {
        it("should produce a critical missing-copilot-instructions finding and exit 1", async () => {
            // Arrange
            const cwd = fixture("integration-scenario");

            // Act
            const { exitCode, stdout } = await runDoctor(
                ["--format", "json"],
                cwd,
            );

            // Assert
            expect(exitCode).toBe(1);
            const report = JSON.parse(stdout) as {
                findings: Array<{ criterionId: string; severity: string }>;
            };
            const critical = report.findings.find(
                (f) => f.criterionId === "missing-copilot-instructions",
            );
            expect(critical).toBeDefined();
            expect(critical?.severity).toBe("critical");
        });

        it("should include a populated inventory array alongside unchanged legacy keys", async () => {
            // Arrange
            const cwd = fixture("integration-scenario");

            // Act
            const { stdout } = await runDoctor(["--format", "json"], cwd);

            // Assert
            const report = JSON.parse(stdout) as {
                archetype: string;
                dominanceScore: number;
                totalRecords: number;
                harnessBreakdown: unknown[];
                crossHarnessEdges: number;
                inventory: Array<{ id: string; path: string }>;
                edges: unknown[];
            };
            expect(report).toHaveProperty("archetype");
            expect(report).toHaveProperty("dominanceScore");
            expect(report).toHaveProperty("harnessBreakdown");
            expect(report).toHaveProperty("crossHarnessEdges");
            expect(report.inventory.length).toBe(report.totalRecords);
            expect(Array.isArray(report.edges)).toBe(true);
        });
    });

    describe("when run with --summary on the integration-scenario fixture", () => {
        it("should exit 0 because --summary skips evaluation", async () => {
            // Arrange
            const cwd = fixture("integration-scenario");

            // Act
            const { exitCode } = await runDoctor(["--summary"], cwd);

            // Assert
            expect(exitCode).toBe(0);
        });
    });

    describe("intent load diagnostics", () => {
        const DocumentedIntentExample = {
            targetHarnesses: ["copilot", "claude", "codex"],
            desiredCapabilities: ["copilot-workspace-instructions"],
            confirmedAnswers: {
                archetype: "intentional-hybrid",
                rationale:
                    "Copilot, Claude Code, and Codex are intentional. CLAUDE.md hard-imports shared Copilot instructions.",
            },
            intentSource: "pre-committed",
        };
        const repoRootIntentPath = resolve(
            __dirname,
            "..",
            "..",
            "..",
            "..",
            ".agentic-doctor",
            "intent.json",
        );

        const ReportSchema = z.object({
            intent: z.object({
                status: z.string(),
                checkedPath: z.string(),
                reason: z.string().optional(),
                issues: z
                    .array(z.object({ path: z.string(), message: z.string() }))
                    .optional(),
            }),
            findings: z.array(z.object({ criterionId: z.string() })),
        });

        let repoRoot: string;

        beforeEach(async () => {
            repoRoot = await realpath(
                await mkdtemp(join(tmpdir(), "doctor-intent-")),
            );
            await writeFile(join(repoRoot, "CLAUDE.md"), "# Project\n");
        });

        afterEach(async () => {
            await rm(repoRoot, { recursive: true, force: true });
        });

        async function writeIntent(content: string): Promise<void> {
            await mkdir(join(repoRoot, ".agentic-doctor"), { recursive: true });
            await writeFile(
                join(repoRoot, ".agentic-doctor", "intent.json"),
                content,
            );
        }

        function intentFindingIds(criterionIds: string[]): string[] {
            return criterionIds.filter((id) => id.endsWith("intent-artifact"));
        }

        async function runBothFormats(cwd: string) {
            const text = await runDoctor(["--ci"], cwd);
            const json = await runDoctor(["--format=json", "--ci"], cwd);
            const report = ReportSchema.parse(JSON.parse(json.stdout));
            return { text, json, report };
        }

        function expectTextMatchesJson(
            textStdout: string,
            report: z.infer<typeof ReportSchema>,
        ): void {
            expect(textStdout).toContain(`Intent: ${report.intent.status}`);
            expect(textStdout).toContain(
                `Checked path: ${report.intent.checkedPath}`,
            );
            if (report.intent.reason !== undefined) {
                expect(textStdout).toContain(`Reason: ${report.intent.reason}`);
            }
            for (const issue of report.intent.issues ?? []) {
                expect(textStdout).toContain(`${issue.path}: ${issue.message}`);
            }
            for (const { criterionId } of report.findings) {
                expect(textStdout).toContain(`${criterionId}:`);
            }
        }

        const cases: Array<{
            name: string;
            arrange: () => Promise<void>;
            expectedStatus: string;
            expectedIntentFindings: string[];
        }> = [
            {
                name: "no intent file exists",
                arrange: async () => {},
                expectedStatus: "absent",
                expectedIntentFindings: ["missing-intent-artifact"],
            },
            {
                name: "the documented intent example is a regular file",
                arrange: () =>
                    writeIntent(JSON.stringify(DocumentedIntentExample)),
                expectedStatus: "loaded",
                expectedIntentFindings: [],
            },
            {
                name: "this repository's intent file is copied in",
                arrange: async () =>
                    writeIntent(await readFile(repoRootIntentPath, "utf-8")),
                expectedStatus: "loaded",
                expectedIntentFindings: [],
            },
            {
                name: "the intent file is malformed JSON",
                arrange: () => writeIntent("{"),
                expectedStatus: "invalid-json",
                expectedIntentFindings: ["invalid-intent-artifact"],
            },
            {
                name: "the intent file is missing required fields",
                arrange: () => writeIntent("{}"),
                expectedStatus: "invalid-schema",
                expectedIntentFindings: ["invalid-intent-artifact"],
            },
            {
                name: "the intent file is a symlink inside the repository",
                arrange: async () => {
                    const target = join(repoRoot, "intent-source.json");
                    await writeFile(
                        target,
                        JSON.stringify(DocumentedIntentExample),
                    );
                    await mkdir(join(repoRoot, ".agentic-doctor"));
                    await symlink(
                        target,
                        join(repoRoot, ".agentic-doctor", "intent.json"),
                    );
                },
                expectedStatus: "symlink-rejected",
                expectedIntentFindings: ["invalid-intent-artifact"],
            },
            {
                name: "the intent path is a directory",
                arrange: () =>
                    mkdir(join(repoRoot, ".agentic-doctor", "intent.json"), {
                        recursive: true,
                    }),
                expectedStatus: "read-failed",
                expectedIntentFindings: ["invalid-intent-artifact"],
            },
        ];

        for (const testCase of cases) {
            describe(`when ${testCase.name}`, () => {
                it(`should report intent status ${testCase.expectedStatus} identically in text and JSON`, async () => {
                    // Arrange
                    await testCase.arrange();
                    const expectedCheckedPath = join(
                        repoRoot,
                        ".agentic-doctor",
                        "intent.json",
                    );

                    // Act
                    const { text, json, report } =
                        await runBothFormats(repoRoot);

                    // Assert
                    expect(report.intent.status).toBe(testCase.expectedStatus);
                    expect(report.intent.checkedPath).toBe(expectedCheckedPath);
                    expect(
                        intentFindingIds(
                            report.findings.map((f) => f.criterionId),
                        ),
                    ).toEqual(testCase.expectedIntentFindings);
                    expectTextMatchesJson(text.stdout, report);
                    expect(text.exitCode).toBe(json.exitCode);
                    expect(json.exitCode).toBe(0);
                });
            });
        }

        describe("when the intent file is missing required fields", () => {
            it("should name each missing field with its expected type or allowed values in both formats", async () => {
                // Arrange
                await writeIntent("{}");
                const expectedMessages = {
                    targetHarnesses: /expected array/,
                    desiredCapabilities: /expected array/,
                    confirmedAnswers: /expected record/,
                    intentSource:
                        /expected one of "interactive"\|"ci-assumed"\|"pre-committed"/,
                };

                // Act
                const { text, report } = await runBothFormats(repoRoot);

                // Assert
                const messageByPath = new Map(
                    (report.intent.issues ?? []).map((i) => [
                        i.path,
                        i.message,
                    ]),
                );
                for (const [path, pattern] of Object.entries(
                    expectedMessages,
                )) {
                    expect(messageByPath.get(path)).toMatch(pattern);
                    expect(text.stdout).toContain(
                        `${path}: ${messageByPath.get(path)}`,
                    );
                }
            });
        });

        describe("when the intent file declares an unknown harness", () => {
            it("should list the allowed harness values for the failing entry in both formats", async () => {
                // Arrange
                await writeIntent(
                    JSON.stringify({
                        ...DocumentedIntentExample,
                        targetHarnesses: ["claude", "not-a-harness"],
                    }),
                );

                // Act
                const { text, report } = await runBothFormats(repoRoot);

                // Assert
                expect(report.intent.status).toBe("invalid-schema");
                const issue = report.intent.issues?.find(
                    (i) => i.path === "targetHarnesses.1",
                );
                expect(issue?.message).toMatch(
                    /expected one of "claude"\|"copilot"\|"codex"/,
                );
                expect(issue?.message).not.toContain("not-a-harness");
                expect(text.stdout).toContain(
                    `targetHarnesses.1: ${issue?.message}`,
                );
            });
        });

        describe("when run from a subdirectory while the intent file is at the repository root", () => {
            it("should report the subdirectory path it actually checked", async () => {
                // Arrange
                await writeIntent(JSON.stringify(DocumentedIntentExample));
                const nestedDir = join(repoRoot, "src");
                await mkdir(nestedDir);
                await writeFile(join(nestedDir, "CLAUDE.md"), "# Nested\n");

                // Act
                const { text, report } = await runBothFormats(nestedDir);

                // Assert
                expect(report.intent).toMatchObject({
                    status: "absent",
                    checkedPath: join(
                        nestedDir,
                        ".agentic-doctor",
                        "intent.json",
                    ),
                });
                expectTextMatchesJson(text.stdout, report);
            });
        });
    });
});
