import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MAX_WALK_DIRECTORIES } from "@lousy-agents/core/gateways/repository-walk.js";
import Chance from "chance";
import { createConsola } from "consola";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runDoctorCommand } from "./run-doctor-command.js";

const chance = new Chance();

const DIRECTORY_BATCH_SIZE = 250;

async function createTruncatedRepository(): Promise<string> {
    const root = await mkdtemp(
        join(await realpath(tmpdir()), "doctor-truncated-"),
    );
    await writeFile(join(root, "CLAUDE.md"), "# Claude\n");
    await mkdir(join(root, ".github"));
    await writeFile(
        join(root, ".github", "copilot-instructions.md"),
        "# Copilot\n",
    );
    const bulk = join(root, "bulk");
    await mkdir(bulk);
    const total = DEFAULT_MAX_WALK_DIRECTORIES + 1;
    for (let start = 0; start < total; start += DIRECTORY_BATCH_SIZE) {
        await Promise.all(
            Array.from(
                { length: Math.min(DIRECTORY_BATCH_SIZE, total - start) },
                (_, offset) => mkdir(join(bulk, `d${start + offset}`)),
            ),
        );
    }
    return root;
}

function buildEnvironment(cwd: string) {
    const logged: string[] = [];
    const warned: string[] = [];
    const logger = createConsola({
        level: 3,
        reporters: [
            {
                log: (entry) => {
                    const line = entry.args.join(" ");
                    logged.push(line);
                    if (entry.type === "warn") {
                        warned.push(line);
                    }
                },
            },
        ],
    });
    const confirm = vi.fn();
    return {
        environment: {
            cwd,
            stdinIsTty: true,
            createLogger: () => logger,
            writeStdout: () => {},
            confirm,
        },
        confirm,
        logged,
        warned,
    };
}

describe("runDoctorCommand when the scan stopped at its directory limit", () => {
    let truncatedRoot: string;

    beforeAll(async () => {
        truncatedRoot = await createTruncatedRepository();
    });

    afterAll(async () => {
        await rm(truncatedRoot, { recursive: true, force: true });
    });

    describe("when the intent questions fail", () => {
        it("should warn that the scan was cut short and then reject with the original error", async () => {
            const failure = new Error(chance.sentence());
            const env = buildEnvironment(truncatedRoot);
            env.confirm.mockRejectedValue(failure);

            await expect(
                runDoctorCommand(
                    { format: "human", summary: false, ci: false },
                    env.environment,
                ),
            ).rejects.toBe(failure);

            expect(env.confirm).toHaveBeenCalledTimes(1);
            expect(env.warned).toEqual([
                expect.stringContaining(
                    `stopped after listing ${DEFAULT_MAX_WALK_DIRECTORIES} directories`,
                ),
            ]);
        });
    });

    describe("when nothing fails", () => {
        it("should report the cut-short scan once, among the findings, instead of warning twice", async () => {
            const env = buildEnvironment(truncatedRoot);
            env.confirm.mockResolvedValue(false);

            const exitCode = await runDoctorCommand(
                { format: "human", summary: false, ci: false },
                env.environment,
            );

            const mentions = env.logged.filter((line) =>
                line.includes("discovery-limit-reached"),
            );
            expect(exitCode).toBe(0);
            expect(mentions).toHaveLength(1);
            expect(env.warned).toEqual([]);
        });
    });
});
