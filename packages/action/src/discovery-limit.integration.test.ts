import { execFile } from "node:child_process";
import {
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const actionBin = resolve(__dirname, "..", "dist", "index.js");

const PRODUCTION_DIRECTORY_LIMIT = 10_000;

describe("the GitHub Action when the repository has more directories than the discovery limit", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await mkdtemp(
            join(await realpath(tmpdir()), "action-limit-"),
        );
        const instructions = join(repoRoot, ".github", "instructions");
        await mkdir(instructions, { recursive: true });
        await writeFile(join(repoRoot, "AGENTS.md"), "# Agents\n");
        const batchSize = 250;
        for (
            let start = 0;
            start < PRODUCTION_DIRECTORY_LIMIT + 1;
            start += batchSize
        ) {
            await Promise.all(
                Array.from(
                    {
                        length: Math.min(
                            batchSize,
                            PRODUCTION_DIRECTORY_LIMIT + 1 - start,
                        ),
                    },
                    (_, offset) =>
                        mkdir(join(instructions, `d${start + offset}`)),
                ),
            );
        }
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    function rdjsonlCodes(stdout: string): Array<string | undefined> {
        return stdout
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map(
                (line) =>
                    (JSON.parse(line) as { code?: { value: string } }).code
                        ?.value,
            );
    }

    it("should write the limit warning to the annotations file the step replays and to the job summary, not to stderr, and keep the rdjsonl on stdout", async () => {
        const runnerTemp = await mkdtemp(
            join(await realpath(tmpdir()), "action-runner-temp-"),
        );
        const annotationsFile = join(runnerTemp, "lousy-agents-annotations");
        const stepSummaryFile = join(runnerTemp, "step-summary.md");
        const env = {
            ...process.env,
            // biome-ignore lint/style/useNamingConvention: env var name
            INPUT_DIRECTORY: ".",
            // biome-ignore lint/style/useNamingConvention: env var name
            INPUT_INSTRUCTIONS: "true",
            // biome-ignore lint/style/useNamingConvention: env var name
            RUNNER_TEMP: runnerTemp,
            // biome-ignore lint/style/useNamingConvention: env var name
            LOUSY_AGENTS_ANNOTATIONS_FILE: annotationsFile,
            // biome-ignore lint/style/useNamingConvention: env var name
            GITHUB_STEP_SUMMARY: stepSummaryFile,
        };

        try {
            const { stdout, stderr } = await execFileAsync(
                process.execPath,
                [actionBin],
                { cwd: repoRoot, env },
            );

            expect(await readFile(annotationsFile, "utf8")).toMatch(
                /^::warning title=instruction\/discovery-limit-reached::.+\n$/,
            );
            expect(stderr).not.toContain("::warning");
            expect(await readFile(stepSummaryFile, "utf8")).toContain(
                "instruction/discovery-limit-reached",
            );
            expect(rdjsonlCodes(stdout)).toContain(
                "instruction/discovery-limit-reached",
            );
        } finally {
            await rm(runnerTemp, { recursive: true, force: true });
        }
    });

    it("should fall back to a workflow command on stderr when no annotations file is configured", async () => {
        const env = {
            ...process.env,
            // biome-ignore lint/style/useNamingConvention: env var name
            INPUT_DIRECTORY: ".",
            // biome-ignore lint/style/useNamingConvention: env var name
            INPUT_INSTRUCTIONS: "true",
        };

        const { stdout, stderr } = await execFileAsync(
            process.execPath,
            [actionBin],
            { cwd: repoRoot, env },
        );

        expect(stderr).toContain(
            "::warning title=instruction/discovery-limit-reached::",
        );
        expect(rdjsonlCodes(stdout)).toContain(
            "instruction/discovery-limit-reached",
        );
    });
});
