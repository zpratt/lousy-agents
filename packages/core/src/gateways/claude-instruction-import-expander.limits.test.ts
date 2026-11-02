import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MAX_FILE_BYTES } from "../lib/instruction-import-expand.js";
import { createClaudeInstructionImportExpander } from "./claude-instruction-import-expander.js";

const SIZE_EXCEEDED = "instruction/import-size-exceeded";
const BUDGET_MS = 5_000;
const TEST_TIMEOUT_MS = 120_000;

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

            const start = performance.now();
            const result =
                await createClaudeInstructionImportExpander().expandClaudeEntrypoint(
                    { repoRoot, absoluteFilePath: claudePath },
                );
            const elapsed = performance.now() - start;

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
