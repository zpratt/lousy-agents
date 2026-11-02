import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRegularFileNoFollow } from "../gateways/read-regular-file-no-follow.js";
import { inspectPathWithinRoot } from "../gateways/real-path-within-root.js";
import {
    buildEffectiveDocument,
    DEFAULT_MAX_FILE_BYTES,
    type ImportFileSystem,
} from "./instruction-import-expand.js";

const SIZE_EXCEEDED = "instruction/import-size-exceeded";
const BUDGET_RUNS = 3;
const BUDGET_MS = 5_000;
const TEST_TIMEOUT_MS = 60_000;

async function fastestRunMs(run: () => Promise<unknown>): Promise<number> {
    const durations: number[] = [];
    for (let attempt = 0; attempt < BUDGET_RUNS; attempt += 1) {
        const start = performance.now();
        await run();
        durations.push(performance.now() - start);
    }
    return Math.min(...durations);
}

describe("buildEffectiveDocument import limit", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await mkdtemp(join(tmpdir(), "import-limit-"));
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    function countingFileSystem(): ImportFileSystem & { inspected: number } {
        const system = {
            inspected: 0,
            inspect: async (rootReal: string, absolutePath: string) => {
                system.inspected += 1;
                return inspectPathWithinRoot(rootReal, absolutePath);
            },
            read: (
                realPath: string,
                maxBytes: number,
                expectedIdentity: Parameters<ImportFileSystem["read"]>[2],
            ) =>
                readRegularFileNoFollow(realPath, maxBytes, {
                    expectedIdentity,
                }),
        };
        return system;
    }

    describe("when an importer has more imports than the limit allows", () => {
        it("should report the limit once for that importer, however many imports follow", async () => {
            await writeFile(join(repoRoot, "a.md"), "A\n");
            await writeFile(
                join(repoRoot, "CLAUDE.md"),
                "@./a.md\n".repeat(50),
            );

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                limits: { maxEdges: 3 },
            });

            const exceeded = result.expansionDiagnostics.filter(
                (d) => d.ruleId === SIZE_EXCEEDED,
            );
            expect(exceeded).toHaveLength(1);
            expect(
                result.edges.filter((e) => e.status === "resolved"),
            ).toHaveLength(3);
            expect(result.edges).toHaveLength(4);
        });

        it("should report it once per importer when two files reach the limit", async () => {
            await writeFile(join(repoRoot, "a.md"), "A\n");
            await writeFile(join(repoRoot, "b.md"), "@./a.md\n".repeat(10));
            await writeFile(
                join(repoRoot, "CLAUDE.md"),
                `@./b.md\n${"@./a.md\n".repeat(10)}`,
            );

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                limits: { maxEdges: 4 },
            });

            const importers = result.expansionDiagnostics
                .filter((d) => d.ruleId === SIZE_EXCEEDED)
                .map((d) => d.filePath)
                .sort();
            expect(importers).toEqual(["CLAUDE.md", "b.md"]);
        });

        it("should say that the file had too many @ tokens and name the limit, not a size or graph limit", async () => {
            await writeFile(join(repoRoot, "a.md"), "A\n");
            await writeFile(join(repoRoot, "CLAUDE.md"), "@./a.md\n".repeat(9));

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                limits: { maxEdges: 3 },
            });

            const diagnostic = result.expansionDiagnostics.find(
                (d) => d.ruleId === SIZE_EXCEEDED,
            );
            expect(diagnostic?.message).toBe(
                "Too many @ tokens (the limit is 3), so this import and the ones after it in CLAUDE.md were not expanded: ./a.md",
            );
        });

        it("should keep the first limited token as the position of the diagnostic", async () => {
            await writeFile(join(repoRoot, "a.md"), "A\n");
            await writeFile(join(repoRoot, "CLAUDE.md"), "@./a.md\n".repeat(5));

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                limits: { maxEdges: 2 },
            });

            const diagnostic = result.expansionDiagnostics.find(
                (d) => d.ruleId === SIZE_EXCEEDED,
            );
            expect(diagnostic?.range).toEqual({
                start: "@./a.md\n".length * 2,
                end: "@./a.md\n".length * 2 + "@./a.md".length,
            });
        });
    });

    describe("when the tokens are not clearly paths and do not resolve", () => {
        it("should count them against the same limit, so a file of them costs a bounded number of lookups", async () => {
            await writeFile(
                join(repoRoot, "CLAUDE.md"),
                "@types/node\n".repeat(40),
            );
            const fileSystem = countingFileSystem();

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                limits: { maxEdges: 5 },
                fileSystem,
            });

            expect(fileSystem.inspected).toBeLessThanOrEqual(5 + 1);
            expect(
                result.expansionDiagnostics.filter(
                    (d) => d.ruleId === SIZE_EXCEEDED,
                ),
            ).toHaveLength(1);
        });
    });

    describe("when a file is made of nothing but imports", () => {
        const importLine = "@a.md\n";
        const lineCount = Math.floor(
            DEFAULT_MAX_FILE_BYTES / importLine.length,
        );

        it(
            "should finish quickly and report the limit once",
            async () => {
                await mkdir(repoRoot, { recursive: true });
                await writeFile(join(repoRoot, "a.md"), "A\n");
                await writeFile(
                    join(repoRoot, "CLAUDE.md"),
                    importLine.repeat(lineCount),
                );

                const expand = () =>
                    buildEffectiveDocument({
                        repoRoot,
                        rootRelativePath: "CLAUDE.md",
                    });

                const result = await expand();
                const fastestMs = await fastestRunMs(expand);

                expect(
                    result.expansionDiagnostics.filter(
                        (d) => d.ruleId === SIZE_EXCEEDED,
                    ),
                ).toHaveLength(1);
                expect(fastestMs).toBeLessThan(BUDGET_MS);
            },
            TEST_TIMEOUT_MS,
        );
    });
});
