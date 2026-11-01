import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLint } from "./lint.js";

const chance = new Chance();

const PRODUCTION_DIRECTORY_LIMIT = 10_000;

/** Creates `count` empty directories under `base`, a few hundred at a time. */
async function makeDirectories(base: string, count: number): Promise<void> {
    const batchSize = 250;
    for (let start = 0; start < count; start += batchSize) {
        const batch = Array.from(
            { length: Math.min(batchSize, count - start) },
            (_, offset) => mkdir(join(base, `d${start + offset}`)),
        );
        await Promise.all(batch);
    }
}

describe("lint --instructions when the repository has more directories than the discovery limit", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = join(tmpdir(), `lint-discovery-limit-${chance.guid()}`);
        await mkdir(join(repoRoot, ".github", "instructions"), {
            recursive: true,
        });
        await writeFile(join(repoRoot, "AGENTS.md"), "# Agents\n");
        await makeDirectories(
            join(repoRoot, ".github", "instructions"),
            PRODUCTION_DIRECTORY_LIMIT + 1,
        );
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    it("should warn exactly once about the limit, keep the files found, and not fail the run", async () => {
        const result = await runLint({
            directory: repoRoot,
            targets: { instructions: true },
        });

        const realRoot = await realpath(repoRoot);
        const output = result.outputs.find((o) => o.target === "instruction");
        const limitDiagnostics = (output?.diagnostics ?? []).filter(
            (d) => d.ruleId === "instruction/discovery-limit-reached",
        );
        expect(limitDiagnostics).toHaveLength(1);
        expect(limitDiagnostics[0]).toMatchObject({
            filePath: realRoot,
            line: 1,
            severity: "warning",
        });
        expect(output?.filesAnalyzed).toContain(join(realRoot, "AGENTS.md"));
        expect(result.hasErrors).toBe(false);
    });
});
