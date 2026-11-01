import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { analyzeInstructionQualityHandler } from "./analyze-instruction-quality.js";

const chance = new Chance();

const ResponseSchema = z.object({
    success: z.boolean(),
    diagnostics: z.array(
        z.object({
            filePath: z.string(),
            line: z.number(),
            severity: z.string(),
            ruleId: z.string().optional(),
        }),
    ),
    discoveredFiles: z.array(z.object({ filePath: z.string() })),
});

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

describe("MCP analyze_instruction_quality when the repository has more directories than the discovery limit", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = join(tmpdir(), `mcp-discovery-limit-${chance.guid()}`);
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

    it("should include exactly one discovery-limit warning in diagnostics and keep the files found", async () => {
        const response = await analyzeInstructionQualityHandler({
            targetDir: repoRoot,
        });

        const text = response.content.find((c) => c.type === "text");
        const parsed = ResponseSchema.parse(JSON.parse(text?.text ?? "{}"));
        const limitDiagnostics = parsed.diagnostics.filter(
            (d) => d.ruleId === "instruction/discovery-limit-reached",
        );
        expect(parsed.success).toBe(true);
        expect(limitDiagnostics).toEqual([
            expect.objectContaining({
                filePath: repoRoot,
                line: 1,
                severity: "warning",
            }),
        ]);
        expect(parsed.discoveredFiles.map((f) => f.filePath)).toContain(
            join(repoRoot, "AGENTS.md"),
        );
    });
});
