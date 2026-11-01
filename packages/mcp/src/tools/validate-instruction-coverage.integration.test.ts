import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { validateInstructionCoverageHandler } from "./validate-instruction-coverage.js";

const chance = new Chance();

const ResponseSchema = z.object({
    success: z.boolean(),
    hasFullCoverage: z.boolean(),
    message: z.string(),
    diagnostics: z.array(z.object({ ruleId: z.string(), message: z.string() })),
});

const PRODUCTION_DIRECTORY_LIMIT = 10_000;
const DIRECTORY_BATCH_SIZE = 250;

async function makeDirectories(base: string, count: number): Promise<void> {
    for (let start = 0; start < count; start += DIRECTORY_BATCH_SIZE) {
        await Promise.all(
            Array.from(
                { length: Math.min(DIRECTORY_BATCH_SIZE, count - start) },
                (_, offset) => mkdir(join(base, `d${start + offset}`)),
            ),
        );
    }
}

async function coverageResponse(targetDir: string) {
    const response = await validateInstructionCoverageHandler({ targetDir });
    const text = response.content.find((c) => c.type === "text");
    return ResponseSchema.parse(JSON.parse(text?.text ?? "{}"));
}

describe("MCP validate_instruction_coverage", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = join(tmpdir(), `mcp-coverage-limit-${chance.guid()}`);
        await mkdir(join(repoRoot, ".github", "instructions"), {
            recursive: true,
        });
        await writeFile(join(repoRoot, "AGENTS.md"), "# Agents\n");
        await writeFile(
            join(repoRoot, "package.json"),
            JSON.stringify({ name: "fixture", scripts: { test: "vitest" } }),
        );
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    describe("when the repository has more directories than the discovery limit", () => {
        it("should report exactly one discovery-limit diagnostic, as analyze_instruction_quality does", async () => {
            await makeDirectories(
                join(repoRoot, ".github", "instructions"),
                PRODUCTION_DIRECTORY_LIMIT + 1,
            );

            const parsed = await coverageResponse(repoRoot);

            expect(parsed.success).toBe(true);
            expect(parsed.diagnostics).toEqual([
                {
                    ruleId: "instruction/discovery-limit-reached",
                    message: expect.stringContaining(
                        `${PRODUCTION_DIRECTORY_LIMIT}`,
                    ),
                },
            ]);
        });
    });

    describe("when the repository has more directories than the discovery limit and a mandatory script is not documented", () => {
        it("should say the coverage is partial instead of reporting a plain percentage", async () => {
            await makeDirectories(
                join(repoRoot, ".github", "instructions"),
                PRODUCTION_DIRECTORY_LIMIT + 1,
            );

            const parsed = await coverageResponse(repoRoot);

            expect(parsed.hasFullCoverage).toBe(false);
            expect(parsed.message).toContain("discovery stopped early");
            expect(parsed.message).toContain(
                "may be documented in files that were not checked",
            );
        });
    });

    describe("when the repository has more directories than the discovery limit and every mandatory script is documented", () => {
        it("should still say that other instruction files were not checked", async () => {
            await writeFile(
                join(repoRoot, "AGENTS.md"),
                "# Agents\n\nRun `npm test` before every commit.\n",
            );
            await makeDirectories(
                join(repoRoot, ".github", "instructions"),
                PRODUCTION_DIRECTORY_LIMIT + 1,
            );

            const parsed = await coverageResponse(repoRoot);

            expect(parsed.hasFullCoverage).toBe(true);
            expect(parsed.message).toContain("discovery stopped early");
            expect(parsed.message).toContain(
                "other instruction files were not checked",
            );
        });
    });

    describe("when the whole tree is listed", () => {
        it("should report an empty list of diagnostics", async () => {
            const parsed = await coverageResponse(repoRoot);

            expect(parsed.success).toBe(true);
            expect(parsed.diagnostics).toEqual([]);
            expect(parsed.message).not.toContain("discovery stopped early");
        });
    });
});
