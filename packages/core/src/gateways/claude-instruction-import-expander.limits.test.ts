import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    DEFAULT_MAX_EMITTED_BYTES,
    DEFAULT_MAX_FILE_BYTES,
} from "../lib/instruction-import-expand.js";
import { createClaudeInstructionImportExpander } from "./claude-instruction-import-expander.js";

const SIZE_EXCEEDED = "instruction/import-size-exceeded";
const BUDGET_MS = 5_000;
const BUDGET_RUNS = 3;
const TEST_TIMEOUT_MS = 120_000;

async function timedRun<T>(
    run: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
    const start = performance.now();
    const result = await run();
    return { result, ms: performance.now() - start };
}

async function fastestRun<T>(
    run: () => Promise<T>,
): Promise<{ result: T; fastestMs: number }> {
    const first = await timedRun(run);
    let fastestMs = first.ms;
    for (let attempt = 1; attempt < BUDGET_RUNS; attempt += 1) {
        fastestMs = Math.min(fastestMs, (await timedRun(run)).ms);
    }
    return { result: first.result, fastestMs };
}

describe("createClaudeInstructionImportExpander on a file made of imports", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await mkdtemp(join(tmpdir(), "expander-limits-"));
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    it(
        "should expand a file of the largest size within the budget and report the limit once",
        async () => {
            const line = "@a.md\n";
            const claudePath = join(repoRoot, "CLAUDE.md");
            await writeFile(join(repoRoot, "a.md"), "A\n");
            await writeFile(
                claudePath,
                line.repeat(Math.floor(DEFAULT_MAX_FILE_BYTES / line.length)),
            );

            const { result, fastestMs: elapsed } = await fastestRun(() =>
                createClaudeInstructionImportExpander().expandClaudeEntrypoint({
                    repoRoot,
                    absoluteFilePath: claudePath,
                }),
            );

            expect(
                result.expansionDiagnostics.filter(
                    (d) => d.ruleId === SIZE_EXCEEDED,
                ),
            ).toHaveLength(1);
            expect(elapsed).toBeLessThan(BUDGET_MS);
        },
        TEST_TIMEOUT_MS,
    );
});

describe("createClaudeInstructionImportExpander on a file longer than the emit budget", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await mkdtemp(join(tmpdir(), "expander-emit-limit-"));
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    it("should report the size limit at the line where the content was cut", async () => {
        const line = "x\n";
        const linesThatFit = DEFAULT_MAX_EMITTED_BYTES / line.length;
        const claudePath = join(repoRoot, "CLAUDE.md");
        await writeFile(claudePath, line.repeat(linesThatFit + 100));

        const result =
            await createClaudeInstructionImportExpander().expandClaudeEntrypoint(
                { repoRoot, absoluteFilePath: claudePath },
            );

        expect(
            result.expansionDiagnostics.filter(
                (d) => d.ruleId === SIZE_EXCEEDED,
            ),
        ).toMatchObject([
            {
                filePath: claudePath,
                line: linesThatFit + 1,
                column: 1,
                endLine: linesThatFit + 100 + 1,
            },
        ]);
    });
});
