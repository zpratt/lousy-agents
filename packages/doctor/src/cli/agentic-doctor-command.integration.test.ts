import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const standaloneBin = resolve(__dirname, "..", "..", "dist", "cli", "index.js");
const fixturesDir = resolve(__dirname, "..", "..", "tests", "fixtures");
const BLOCKING_FIXTURE = "integration-scenario";
const NON_BLOCKING_FIXTURE = "accidental-sprawl";

const ExecFailureSchema = z.object({
    code: z.number().optional(),
    stdout: z.string().optional(),
});

interface ExecResult {
    exitCode: number;
    stdout: string;
}

function userEnvironment(): NodeJS.ProcessEnv {
    const { TEST: _testFlag, ...env } = process.env;
    // biome-ignore lint/style/useNamingConvention: env var
    return { ...env, NO_COLOR: "1" };
}

async function runStandaloneBin(
    args: string[],
    fixtureName: string,
): Promise<ExecResult> {
    try {
        const result = await execFileAsync(
            process.execPath,
            [standaloneBin, ...args],
            { cwd: resolve(fixturesDir, fixtureName), env: userEnvironment() },
        );
        return { exitCode: 0, stdout: result.stdout };
    } catch (err: unknown) {
        const failure = ExecFailureSchema.safeParse(err);
        if (!failure.success) throw err;
        return {
            exitCode: failure.data.code ?? 1,
            stdout: failure.data.stdout ?? "",
        };
    }
}

describe("standalone agentic-doctor bin", () => {
    describe("when the evaluation finds a blocking defect", () => {
        it.each(["human", "json"])(
            "should exit 1 with %s output",
            async (format) => {
                const { exitCode, stdout } = await runStandaloneBin(
                    [`--format=${format}`, "--ci"],
                    BLOCKING_FIXTURE,
                );

                expect(exitCode).toBe(1);
                expect(stdout.length).toBeGreaterThan(0);
            },
        );
    });

    describe("when the evaluation finds nothing that blocks", () => {
        it("should exit 0", async () => {
            const { exitCode, stdout } = await runStandaloneBin(
                ["--format=json", "--ci"],
                NON_BLOCKING_FIXTURE,
            );

            expect(exitCode).toBe(0);
            expect(JSON.parse(stdout).evaluation).toBe("completed");
        });
    });
});
