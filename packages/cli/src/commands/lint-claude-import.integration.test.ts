/**
 * Black-box CLI acceptance locks for Claude `@` instruction import expansion
 * (matrix cells A2–A6, A11–A13 + deterministic diagnostic ordering).
 *
 * Runs the real CLI entrypoint via tsx against tmpdir fixtures with real discovery
 * (root CLAUDE.md + AGENTS.md only as entrypoints).
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

/** Mirrors DEFAULT_STRUCTURAL_HEADING_PATTERNS without importing production internals. */
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

describe("Claude instruction import black-box acceptance (CLI)", () => {
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

    describe("A2: wrapper text before/after import with ordered splice", () => {
        it("should suppress missing-structural-heading on CLAUDE when AGENTS supplies headings via mid-document import", async () => {
            // Arrange — headings split across pre-import wrapper, imported body, and post-import wrapper
            // so only ordered splice (not replace-with-import, drop-before, or physical-file-only) yields a full set.
            const repoDir = await makeRepoDir("a2");
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

            // Assert — CLAUDE effective doc has all headings via ordered splice
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
            // AGENTS is its own entrypoint and only has the imported third
            expect(missingStructural(diagnostics, agentsPath).length).toBe(
                STRUCTURAL_HEADINGS.length - importedHeadings.length,
            );
            expect(
                byRule(diagnostics, "instruction/import-unresolved"),
            ).toEqual([]);
        });
    });

    describe("A3: multiple valid imports; structure split across files", () => {
        it("should compose structural headings from two imported parts under CLAUDE", async () => {
            // Arrange
            const repoDir = await makeRepoDir("a3");
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

    describe("A4: same source imported twice with deterministic positional semantics", () => {
        it("should expand a repeated import without cycle diagnostics and keep CLAUDE structurally complete", async () => {
            // Arrange — small dual expand still supplies structure twice without cycle noise
            const repoDir = await makeRepoDir("a4-structure");
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

        it("should double-count emitted bytes when the same large source is imported twice", async () => {
            // Arrange — DEFAULT_MAX_EMITTED_BYTES is 512_000. A body larger than the budget
            // exhausts emit capacity on the first splice; the second splice then fails with
            // import-size-exceeded only when both positions are expanded (not dedupe-once).
            const repoDir = await makeRepoDir("a4-bytes");
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

            // Assert
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

    describe("A5: nested import depth limit (default 4 hops)", () => {
        it("should include four-hop nested content and suppress missing-structural-heading", async () => {
            // Arrange — CLAUDE(0) -> h1(1) -> h2(2) -> h3(3) -> h4(4 leaf with headings)
            const repoDir = await makeRepoDir("a5-ok");
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

        it("should emit import-depth-exceeded on the fifth hop and not follow it for structure", async () => {
            // Arrange — headings only on hop 5 so following it would incorrectly clear missing-structural
            const repoDir = await makeRepoDir("a5-deep");
            const claudePath = join(repoDir, "CLAUDE.md");

            await writeFile(claudePath, "@./d1.md\n");
            await writeFile(join(repoDir, "d1.md"), "@./d2.md\n");
            await writeFile(join(repoDir, "d2.md"), "@./d3.md\n");
            await writeFile(join(repoDir, "d3.md"), "@./d4.md\n");
            await writeFile(join(repoDir, "d4.md"), "leaf-ok\n@./d5.md\n");
            await writeFile(join(repoDir, "d5.md"), compliantBody("TooDeep"));

            // Act
            const diagnostics = await lintInstructionsJson(repoDir);

            // Assert
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

    describe("A6: direct and indirect cycles with independent branch continuation", () => {
        it("should emit import-cycle for a direct cycle without hanging", async () => {
            // Arrange
            const repoDir = await makeRepoDir("a6-direct");
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

        it("should emit import-cycle for an indirect cycle and still expand an independent good branch", async () => {
            // Arrange
            const repoDir = await makeRepoDir("a6-indirect");
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

            // Assert — cycle reported, good branch still supplies structure
            expect(
                byRule(diagnostics, "instruction/import-cycle").length,
            ).toBeGreaterThanOrEqual(1);
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
        });
    });

    describe("A11: non-import @path forms are not expanded", () => {
        it("should not emit import-unresolved for fenced, inline, link, or malformed @paths when targets are missing", async () => {
            // Arrange — only real line-start imports are expandable; fake paths must not produce unresolved
            const repoDir = await makeRepoDir("a11");
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

            // Assert
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

    describe("A12: wide unique-file fan-out and repeated-edge limits", () => {
        it("should emit import-size-exceeded when unique imports exceed DEFAULT_MAX_UNIQUE_FILES (64)", async () => {
            // Arrange — root counts as unique file #1; 64 distinct targets => 65th unique is rejected
            const repoDir = await makeRepoDir("a12-unique");
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

            // Assert
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

        it("should emit import-size-exceeded when the same target is imported past DEFAULT_MAX_EDGES (256)", async () => {
            // Arrange — DEFAULT_MAX_EDGES=256; the 257th edge must fail even if the target is unique-cached
            const repoDir = await makeRepoDir("a12-edges");
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

    describe("A13: two entrypoints with different context (no bleed)", () => {
        it("should not let CLAUDE expanded imports suppress missing-structural-heading on AGENTS.md", async () => {
            // Arrange — CLAUDE imports a private full leaf; AGENTS is thin and must stay incomplete
            const repoDir = await makeRepoDir("a13");
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

            // Assert
            expect(missingStructural(diagnostics, claudePath)).toEqual([]);
            const agentsMissing = missingStructural(diagnostics, agentsPath);
            expect(agentsMissing.length).toBe(STRUCTURAL_HEADINGS.length - 1);
            expect(
                agentsMissing.some((d) => d.message.includes("'Commands'")),
            ).toBe(false);
        });
    });

    describe("deterministic diagnostic ordering", () => {
        it("should emit the same ordered key diagnostics across repeated CLI runs", async () => {
            // Arrange — multiple import failures with stable physical provenance
            const repoDir = await makeRepoDir("order");

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

            // Canonical order mirrors AnalyzeInstructionQualityUseCase.compareImportDiagnostics:
            // filePath → line → column → ruleId
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
