/**
 * End-customer acceptance locks for shared Claude instruction imports.
 *
 * Persona: multi-harness repo authors who keep a thin CLAUDE.md wrapper that
 * `@`-imports canonical AGENTS.md (and related) content. They run
 * `lousy-agents lint --instructions` (CLI / CI / reviewdog) and expect:
 * - no false missing-heading noise on correct wrappers
 * - actionable diagnostics when imports are broken or unsafe
 * - isolation between harness entrypoints (Claude vs AGENTS)
 *
 * Boundary: real CLI entrypoint via tsx against tmpdir fixtures with real
 * discovery (root CLAUDE.md + AGENTS.md as entrypoints).
 */

import { execFile } from "node:child_process";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const chance = new Chance();

const cliPackageDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
);

/** Recommended structural sections customers expect in instruction docs. */
const STRUCTURAL_HEADINGS = [
    "Validation",
    "Verification",
    "Feedback Loop",
    "Mandatory",
    "Before Commit",
    "Validation Suite",
    "Commands",
] as const;

interface LintDiagnosticJson {
    readonly filePath: string;
    readonly line: number;
    readonly column?: number;
    readonly severity: string;
    readonly message: string;
    readonly ruleId?: string;
    readonly target: string;
}

function compliantBody(title = "Instructions"): string {
    return [
        `# ${title}`,
        "",
        ...STRUCTURAL_HEADINGS.flatMap((heading) => [
            `## ${heading}`,
            "",
            "Guidance.",
            "",
        ]),
    ].join("\n");
}

function headingsBody(headings: readonly string[], title = "Partial"): string {
    return [
        `# ${title}`,
        "",
        ...headings.flatMap((heading) => [
            `## ${heading}`,
            "",
            "Guidance.",
            "",
        ]),
    ].join("\n");
}

async function runCli(
    repoDir: string,
    cliArgs: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const tsxPath = join(process.cwd(), "node_modules", ".bin", "tsx");
    const entryPath = join(cliPackageDir, "src", "index.ts");
    try {
        const result = await execFileAsync(
            tsxPath,
            [entryPath, "lint", ...cliArgs],
            {
                cwd: repoDir,
                // biome-ignore lint/style/useNamingConvention: env var
                env: { ...process.env, NO_COLOR: "1" },
            },
        );
        return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: 0,
        };
    } catch (err: unknown) {
        const execErr = err as {
            stdout?: string;
            stderr?: string;
            code?: number;
        };
        return {
            stdout: execErr.stdout ?? "",
            stderr: execErr.stderr ?? "",
            exitCode: execErr.code ?? 1,
        };
    }
}

async function lintInstructionsJson(
    repoDir: string,
): Promise<LintDiagnosticJson[]> {
    const { stdout } = await runCli(repoDir, [
        "--instructions",
        "--format",
        "json",
    ]);
    const trimmed = stdout.trim();
    if (trimmed === "" || trimmed === "[]") {
        return [];
    }
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array of diagnostics, got: ${trimmed}`);
    }
    return parsed as LintDiagnosticJson[];
}

/** Normalize macOS /var vs /private/var so diagnostic paths compare stably. */
function normalizePath(pathValue: string): string {
    return resolve(pathValue).replace(/^\/private\/var\//, "/var/");
}

function pathsEqual(left: string, right: string): boolean {
    return normalizePath(left) === normalizePath(right);
}

function missingStructural(
    diagnostics: readonly LintDiagnosticJson[],
    filePath: string,
): LintDiagnosticJson[] {
    return diagnostics.filter(
        (d) =>
            d.ruleId === "instruction/missing-structural-heading" &&
            pathsEqual(d.filePath, filePath),
    );
}

function byRule(
    diagnostics: readonly LintDiagnosticJson[],
    ruleId: string,
): LintDiagnosticJson[] {
    return diagnostics.filter((d) => d.ruleId === ruleId);
}

function diagnosticOrderKey(d: LintDiagnosticJson): string {
    return [
        d.ruleId ?? "",
        normalizePath(d.filePath),
        String(d.line),
        String(d.column ?? 0),
        d.message,
    ].join("\0");
}

describe("when customers lint shared Claude instruction imports", () => {
    let projectDir: string;

    async function makeRepoDir(label: string): Promise<string> {
        const dir = join(projectDir, `${label}-${chance.hash({ length: 6 })}`);
        await mkdir(dir, { recursive: true });
        return realpath(dir);
    }

    beforeAll(async () => {
        const dir = join(
            tmpdir(),
            `claude-import-bb-${chance.hash({ length: 8 })}`,
        );
        await mkdir(dir, { recursive: true });
        projectDir = await realpath(dir);
    });

    afterAll(async () => {
        if (projectDir) {
            await rm(projectDir, { recursive: true, force: true });
        }
    });

    describe("when a thin CLAUDE.md wrapper mixes local guidance with an imported shared doc", () => {
        it("should not report missing structural headings on the wrapper when the combined document is complete", async () => {
            // Arrange — customer keeps Validation on the wrapper, middle sections in AGENTS.md,
            // and remaining sections after the import (Coach-style shared-instruction layout).
            const repoDir = await makeRepoDir("wrapper-local-and-import");
            const claudePath = join(repoDir, "CLAUDE.md");
            const agentsPath = join(repoDir, "AGENTS.md");

            const preImportHeadings = ["Validation"] as const;
            const importedHeadings = [
                "Verification",
                "Feedback Loop",
                "Mandatory",
            ] as const;
            const postImportHeadings = [
                "Before Commit",
                "Validation Suite",
                "Commands",
            ] as const;

            await writeFile(
                claudePath,
                [
                    "# Claude wrapper",
                    "",
                    "Prose before the import token.",
                    "",
                    ...preImportHeadings.flatMap((heading) => [
                        `## ${heading}`,
                        "",
                        "Pre-import guidance.",
                        "",
                    ]),
                    "@./AGENTS.md",
                    "",
                    "Prose after the import token.",
                    "",
                    ...postImportHeadings.flatMap((heading) => [
                        `## ${heading}`,
                        "",
                        "Local guidance.",
                        "",
                    ]),
                ].join("\n"),
            );
            await writeFile(
                agentsPath,
                headingsBody(importedHeadings, "Agents"),
            );

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert — wrapper is complete via effective shared content
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
            // AGENTS is still judged on its own thin body as a separate entrypoint
            expect(missingStructural(diagnostics, agentsPath).length).toBe(
                STRUCTURAL_HEADINGS.length - importedHeadings.length,
            );
            expect(
                byRule(diagnostics, "instruction/import-unresolved"),
            ).toEqual([]);
        });
    });

    describe("when instruction structure is split across several imported files", () => {
        it("should treat the CLAUDE.md entrypoint as complete when the imported parts supply every required section", async () => {
            // Arrange
            const repoDir = await makeRepoDir("split-across-imports");
            const claudePath = join(repoDir, "CLAUDE.md");
            const partA = join(repoDir, "part-a.md");
            const partB = join(repoDir, "part-b.md");

            const headingsForPartA = [
                "Validation",
                "Verification",
                "Feedback Loop",
            ] as const;
            const headingsForPartB = [
                "Mandatory",
                "Before Commit",
                "Validation Suite",
                "Commands",
            ] as const;

            await writeFile(
                claudePath,
                ["# Claude", "", "@./part-a.md", "", "@./part-b.md", ""].join(
                    "\n",
                ),
            );
            await writeFile(partA, headingsBody(headingsForPartA, "Part A"));
            await writeFile(partB, headingsBody(headingsForPartB, "Part B"));

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
            expect(
                byRule(diagnostics, "instruction/import-unresolved"),
            ).toEqual([]);
        });
    });

    describe("when the same shared file is imported more than once in one wrapper", () => {
        it("should accept the wrapper as complete without reporting a circular import", async () => {
            // Arrange — customers sometimes re-include a shared fragment at two positions
            const repoDir = await makeRepoDir("repeated-import-complete");
            const claudePath = join(repoDir, "CLAUDE.md");
            const sharedPath = join(repoDir, "shared.md");

            await writeFile(
                claudePath,
                [
                    "# Claude",
                    "",
                    "first",
                    "@./shared.md",
                    "middle",
                    "@./shared.md",
                    "last",
                    "",
                ].join("\n"),
            );
            await writeFile(sharedPath, compliantBody("Shared"));

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
            expect(byRule(diagnostics, "instruction/import-cycle")).toEqual([]);
            expect(
                byRule(diagnostics, "instruction/import-unresolved"),
            ).toEqual([]);
        });

        it("should warn when repeating a very large import would make effective instructions unbounded", async () => {
            // Arrange — a huge shared body included twice must not silently grow without bound
            const repoDir = await makeRepoDir("repeated-import-too-large");
            const claudePath = join(repoDir, "CLAUDE.md");
            const sharedPath = join(repoDir, "shared.md");
            const largeBody = `${"x".repeat(512_001)}\n`;

            await writeFile(
                claudePath,
                [
                    "# Claude",
                    "",
                    ...STRUCTURAL_HEADINGS.flatMap((heading) => [
                        `## ${heading}`,
                        "",
                        "Local.",
                        "",
                    ]),
                    "first",
                    "@./shared.md",
                    "middle",
                    "@./shared.md",
                    "last",
                    "",
                ].join("\n"),
            );
            await writeFile(sharedPath, largeBody);

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert — actionable size warning on the wrapper, not a cycle false positive
            expect(byRule(diagnostics, "instruction/import-cycle")).toEqual([]);
            const sizeExceeded = byRule(
                diagnostics,
                "instruction/import-size-exceeded",
            );
            expect(sizeExceeded.length).toBeGreaterThanOrEqual(1);
            expect(
                pathsEqual(sizeExceeded[0]?.filePath ?? "", claudePath),
            ).toBe(true);
        });
    });

    describe("when shared docs nest imports several levels deep", () => {
        it("should honor a moderate nest of shared files and not warn about missing headings on the wrapper", async () => {
            // Arrange — CLAUDE → layer → layer → layer → leaf with full guidance
            const repoDir = await makeRepoDir("moderate-nest");
            const claudePath = join(repoDir, "CLAUDE.md");

            await writeFile(claudePath, "@./h1.md\n");
            await writeFile(join(repoDir, "h1.md"), "@./h2.md\n");
            await writeFile(join(repoDir, "h2.md"), "@./h3.md\n");
            await writeFile(join(repoDir, "h3.md"), "@./h4.md\n");
            await writeFile(join(repoDir, "h4.md"), compliantBody("Hop4"));

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert
            expect(
                byRule(diagnostics, "instruction/import-depth-exceeded"),
            ).toEqual([]);
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
        });

        it("should warn at the too-deep import and not pretend deeper content completed the wrapper", async () => {
            // Arrange — required sections live only past the supported nest depth
            const repoDir = await makeRepoDir("too-deep-nest");
            const claudePath = join(repoDir, "CLAUDE.md");

            await writeFile(claudePath, "@./d1.md\n");
            await writeFile(join(repoDir, "d1.md"), "@./d2.md\n");
            await writeFile(join(repoDir, "d2.md"), "@./d3.md\n");
            await writeFile(join(repoDir, "d3.md"), "@./d4.md\n");
            await writeFile(join(repoDir, "d4.md"), "leaf-ok\n@./d5.md\n");
            await writeFile(join(repoDir, "d5.md"), compliantBody("TooDeep"));

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert — depth warning on the file that tried to go too deep; wrapper still incomplete
            const depth = byRule(
                diagnostics,
                "instruction/import-depth-exceeded",
            );
            expect(depth.length).toBeGreaterThanOrEqual(1);
            expect(
                pathsEqual(depth[0]?.filePath ?? "", join(repoDir, "d4.md")),
            ).toBe(true);
            expect(missingStructural(diagnostics, claudePath).length).toBe(
                STRUCTURAL_HEADINGS.length,
            );
        });
    });

    describe("when import graphs contain cycles", () => {
        it("should report a circular import quickly when two files point at each other", async () => {
            // Arrange
            const repoDir = await makeRepoDir("direct-cycle");
            const claudePath = join(repoDir, "CLAUDE.md");
            const otherPath = join(repoDir, "other.md");

            await writeFile(claudePath, "A\n@./other.md\n");
            await writeFile(otherPath, "B\n@./CLAUDE.md\n");

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert
            const cycles = byRule(diagnostics, "instruction/import-cycle");
            expect(cycles.length).toBeGreaterThanOrEqual(1);
            expect(cycles.some((d) => pathsEqual(d.filePath, otherPath))).toBe(
                true,
            );
        });

        it("should still use a healthy import branch when another branch is circular", async () => {
            // Arrange — one broken cycle plus a complete shared doc on a separate import
            const repoDir = await makeRepoDir("cycle-plus-good-branch");
            const claudePath = join(repoDir, "CLAUDE.md");

            await writeFile(
                claudePath,
                ["@./cycle-a.md", "", "@./good.md", ""].join("\n"),
            );
            await writeFile(join(repoDir, "cycle-a.md"), "@./cycle-b.md\n");
            await writeFile(join(repoDir, "cycle-b.md"), "@./cycle-c.md\n");
            await writeFile(join(repoDir, "cycle-c.md"), "@./cycle-a.md\n");
            await writeFile(join(repoDir, "good.md"), compliantBody("Good"));

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert — cycle is visible, but the good branch still completes the wrapper
            expect(
                byRule(diagnostics, "instruction/import-cycle").length,
            ).toBeGreaterThanOrEqual(1);
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
        });
    });

    describe("when docs mention @paths that are not real imports", () => {
        it("should not warn about missing files for examples inside code, links, or malformed tokens", async () => {
            // Arrange — only a real line-start import should be followed
            const repoDir = await makeRepoDir("docs-not-imports");
            const claudePath = join(repoDir, "CLAUDE.md");

            await writeFile(
                claudePath,
                [
                    "# Claude",
                    "",
                    "```",
                    "@./missing-fenced.md",
                    "```",
                    "",
                    "Use `@./missing-inline.md` in docs.",
                    "",
                    "See [agents](./missing-link.md) for details.",
                    "",
                    "@@./missing-escaped.md",
                    "",
                    "@ missing-space.md",
                    "",
                    "@./real.md",
                    "",
                ].join("\n"),
            );
            await writeFile(join(repoDir, "real.md"), compliantBody("Real"));

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert — no false "file not found" noise from documentation examples
            const unresolved = byRule(
                diagnostics,
                "instruction/import-unresolved",
            );
            expect(unresolved).toEqual([]);
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
            expect(
                diagnostics.some((d) =>
                    d.message.includes("missing-fenced.md"),
                ),
            ).toBe(false);
            expect(
                diagnostics.some((d) =>
                    d.message.includes("missing-inline.md"),
                ),
            ).toBe(false);
            expect(
                diagnostics.some((d) => d.message.includes("missing-link.md")),
            ).toBe(false);
        });
    });

    describe("when an import graph is pathologically wide", () => {
        it("should warn when a wrapper pulls in more unique files than lint will expand", async () => {
            // Arrange — many distinct shared fragments under one wrapper
            const repoDir = await makeRepoDir("too-many-unique-imports");
            const claudePath = join(repoDir, "CLAUDE.md");

            const uniqueCount = 64;
            const importLines: string[] = [];
            for (let i = 1; i <= uniqueCount; i += 1) {
                const name = `u${String(i).padStart(2, "0")}.md`;
                importLines.push(`@./${name}`);
                await writeFile(join(repoDir, name), `body-${i}\n`);
            }

            await writeFile(
                claudePath,
                [
                    "# Claude",
                    "",
                    ...STRUCTURAL_HEADINGS.flatMap((heading) => [
                        `## ${heading}`,
                        "",
                        "Local.",
                        "",
                    ]),
                    ...importLines,
                    "",
                ].join("\n"),
            );

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert — bounded work with a clear warning on the wrapper
            const sizeExceeded = byRule(
                diagnostics,
                "instruction/import-size-exceeded",
            );
            expect(sizeExceeded.length).toBeGreaterThanOrEqual(1);
            expect(
                pathsEqual(sizeExceeded[0]?.filePath ?? "", claudePath),
            ).toBe(true);
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
        });

        it("should warn when the same import is repeated far beyond a reasonable graph size", async () => {
            // Arrange — pathological repeat of one fragment must not hang or run unbounded
            const repoDir = await makeRepoDir("too-many-repeated-imports");
            const claudePath = join(repoDir, "CLAUDE.md");
            const sharedPath = join(repoDir, "shared.md");
            const edgeCount = 257;
            const importLines = Array.from(
                { length: edgeCount },
                () => "@./shared.md",
            );

            await writeFile(sharedPath, "shared-body\n");
            await writeFile(
                claudePath,
                [
                    "# Claude",
                    "",
                    ...STRUCTURAL_HEADINGS.flatMap((heading) => [
                        `## ${heading}`,
                        "",
                        "Local.",
                        "",
                    ]),
                    ...importLines,
                    "",
                ].join("\n"),
            );

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert
            const sizeExceeded = byRule(
                diagnostics,
                "instruction/import-size-exceeded",
            );
            expect(sizeExceeded.length).toBeGreaterThanOrEqual(1);
            expect(
                pathsEqual(sizeExceeded[0]?.filePath ?? "", claudePath),
            ).toBe(true);
            expect(byRule(diagnostics, "instruction/import-cycle")).toEqual([]);
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
        });
    });

    describe("when CLAUDE.md and AGENTS.md are both present as entrypoints", () => {
        it("should not let Claude's imported guidance silence missing-section warnings on AGENTS.md", async () => {
            // Arrange — Claude imports a private complete leaf; AGENTS is intentionally thin
            const repoDir = await makeRepoDir("entrypoint-isolation");
            const claudePath = join(repoDir, "CLAUDE.md");
            const agentsPath = join(repoDir, "AGENTS.md");
            const leafPath = join(repoDir, "claude-only-leaf.md");

            await writeFile(claudePath, "@./claude-only-leaf.md\n");
            await writeFile(leafPath, compliantBody("Claude leaf"));
            await writeFile(
                agentsPath,
                [
                    "# Agents",
                    "",
                    "## Commands",
                    "",
                    "Only commands on the AGENTS entrypoint.",
                    "",
                ].join("\n"),
            );

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert — each harness entrypoint is judged on its own effective content
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
            const agentsMissing = missingStructural(diagnostics, agentsPath);
            expect(agentsMissing.length).toBe(STRUCTURAL_HEADINGS.length - 1);
            expect(
                agentsMissing.some((d) => d.message.includes("'Commands'")),
            ).toBe(false);
        });
    });

    describe("when CI consumers re-run lint on the same broken import graph", () => {
        it("should report the same import problems in the same order every time", async () => {
            // Arrange — missing targets and a path escape that reviewdog/JSON consumers will annotate
            const repoDir = await makeRepoDir("stable-diagnostics");

            await writeFile(
                join(repoDir, "CLAUDE.md"),
                [
                    "# Claude",
                    "",
                    "@./missing-a.md",
                    "",
                    "@./mid.md",
                    "",
                    "@../escape.md",
                    "",
                ].join("\n"),
            );
            await writeFile(
                join(repoDir, "mid.md"),
                "mid\n@./missing-b.md\n@./missing-c.md\n",
            );

            // Act
            const run1 = await lintInstructionsJson(repoDir);
            const run2 = await lintInstructionsJson(repoDir);

            const importRules = new Set([
                "instruction/import-unresolved",
                "instruction/import-escape",
                "instruction/import-cycle",
                "instruction/import-depth-exceeded",
                "instruction/import-size-exceeded",
            ]);
            const importDiags1 = run1.filter(
                (d) => d.ruleId !== undefined && importRules.has(d.ruleId),
            );
            const importDiags2 = run2.filter(
                (d) => d.ruleId !== undefined && importRules.has(d.ruleId),
            );
            const keys1 = importDiags1.map(diagnosticOrderKey);
            const keys2 = importDiags2.map(diagnosticOrderKey);

            // Stable consumer order: file path → line → column → rule
            const canonicalKeys = [...importDiags1]
                .sort((a, b) => {
                    const pathCmp = normalizePath(a.filePath).localeCompare(
                        normalizePath(b.filePath),
                    );
                    if (pathCmp !== 0) {
                        return pathCmp;
                    }
                    if (a.line !== b.line) {
                        return a.line - b.line;
                    }
                    const aCol = a.column ?? 0;
                    const bCol = b.column ?? 0;
                    if (aCol !== bCol) {
                        return aCol - bCol;
                    }
                    return (a.ruleId ?? "").localeCompare(b.ruleId ?? "");
                })
                .map(diagnosticOrderKey);

            // Assert
            expect(keys1.length).toBeGreaterThanOrEqual(3);
            expect(keys2).toEqual(keys1);
            expect(keys1).toEqual(canonicalKeys);
        });
    });
});
