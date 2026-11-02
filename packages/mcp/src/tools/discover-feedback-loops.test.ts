import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { discoverFeedbackLoopsHandler } from "./discover-feedback-loops.js";

const ScriptEntrySchema = z.object({
    name: z.string(),
    command: z.string(),
    mandatory: z.boolean(),
});
const ToolEntrySchema = ScriptEntrySchema.extend({ source: z.string() });
const ResponseSchema = z.object({
    scriptsByPhase: z.record(z.string(), z.array(ScriptEntrySchema)),
    toolsByPhase: z.record(z.string(), z.array(ToolEntrySchema)),
});

describe("discover_feedback_loops", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await mkdtemp(join(tmpdir(), "discover-feedback-loops-"));
        await mkdir(join(repoRoot, ".github", "workflows"), {
            recursive: true,
        });
        await writeFile(
            join(repoRoot, "package.json"),
            JSON.stringify({
                name: "fixture",
                scripts: {
                    test: "vitest run",
                    "test:unit": "vitest run unit",
                    lint: "biome check .",
                    dev: "tsx watch src",
                },
            }),
        );
        await writeFile(
            join(repoRoot, ".github", "workflows", "ci.yml"),
            JSON.stringify({
                name: "CI",
                on: "push",
                jobs: {
                    check: {
                        "runs-on": "ubuntu-latest",
                        steps: [
                            { name: "Lint", run: "npx biome check ." },
                            { name: "Types", run: "npx tsc --noEmit" },
                        ],
                    },
                },
            }),
        );
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    async function discover() {
        const result = await discoverFeedbackLoopsHandler({
            targetDir: repoRoot,
        });
        const text = result.content.find((c) => c.type === "text")?.text;
        return ResponseSchema.parse(JSON.parse(text ?? "{}"));
    }

    it("should group the scripts by phase, every script of a phase together and in the order written", async () => {
        const { scriptsByPhase } = await discover();

        expect(scriptsByPhase).toEqual({
            test: [
                { name: "test", command: "vitest run", mandatory: true },
                {
                    name: "test:unit",
                    command: "vitest run unit",
                    mandatory: true,
                },
            ],
            lint: [{ name: "lint", command: "biome check .", mandatory: true }],
            dev: [{ name: "dev", command: "tsx watch src", mandatory: false }],
        });
    });

    it("should group the workflow tools by phase with the workflow each came from", async () => {
        const { toolsByPhase } = await discover();

        expect(toolsByPhase).toEqual({
            lint: [
                {
                    name: "npx biome",
                    command: "npx biome check .",
                    mandatory: true,
                    source: "ci.yml",
                },
            ],
            unknown: [
                {
                    name: "npx tsc",
                    command: "npx tsc --noEmit",
                    mandatory: false,
                    source: "ci.yml",
                },
            ],
        });
    });
});
