import {
    chmod,
    mkdir,
    mkdtemp,
    realpath,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GateError } from "./gate-error.js";
import { spawnCoach } from "./spawn-coach.js";

const chance = new Chance();

describe("spawnCoach", () => {
    let workDir: string;
    let binDir: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(await realpath(tmpdir()), "spawn-coach-"));
        binDir = join(workDir, "bin");
        await mkdir(binDir);
    });

    afterEach(async () => {
        vi.useRealTimers();
        await rm(workDir, { recursive: true, force: true });
    });

    async function installCoach(script: string): Promise<NodeJS.ProcessEnv> {
        const executable = join(binDir, "coach");
        await writeFile(executable, `#!/bin/sh\n${script}\n`);
        await chmod(executable, 0o755);
        return {
            // biome-ignore lint/style/useNamingConvention: environment variable name
            PATH: `${binDir}${delimiter}/usr/bin${delimiter}/bin`,
        };
    }

    async function installCoachIgnoringSigterm(): Promise<NodeJS.ProcessEnv> {
        const executable = join(binDir, "coach");
        await writeFile(
            executable,
            `#!${process.execPath}\nprocess.on("SIGTERM", () => {});\nsetInterval(() => {}, 1000);\n`,
        );
        await chmod(executable, 0o755);
        return {
            // biome-ignore lint/style/useNamingConvention: environment variable name
            PATH: `${binDir}${delimiter}/usr/bin${delimiter}/bin`,
        };
    }

    describe("when coach runs to the end", () => {
        it("should return its exit code, stdout and stderr", async () => {
            // Arrange
            const out = chance.word();
            const err = chance.word();
            const env = await installCoach(
                `echo ${out}; echo ${err} >&2; exit 3`,
            );

            // Act
            const run = await spawnCoach([], { env });

            // Assert
            expect(run).toEqual({
                exitCode: 3,
                stdout: `${out}\n`,
                stderr: `${err}\n`,
            });
        });

        it("should pass every argument as it is, never through a shell", async () => {
            // Arrange
            const env = await installCoach('printf "%s\\n" "$@"');
            const args = ["a;b", "$(echo hacked)", "x y", "`id`", "--flag=*"];

            // Act
            const run = await spawnCoach(args, { env });

            // Assert
            expect(run.stdout).toBe(`${args.join("\n")}\n`);
        });

        it("should run in the directory it is given", async () => {
            // Arrange
            const env = await installCoach("pwd");

            // Act
            const run = await spawnCoach([], { env, cwd: workDir });

            // Assert
            expect(run.stdout.trim()).toBe(workDir);
        });

        it("should keep reading output that is larger than a pipe buffer", async () => {
            // Arrange
            const env = await installCoach(
                "head -c 300000 /dev/zero | tr '\\0' 'x'",
            );

            // Act
            const run = await spawnCoach([], { env });

            // Assert
            expect(run.stdout).toHaveLength(300000);
        });
    });

    describe("when coach is ended by a signal", () => {
        it("should report no exit code, so the gate fails", async () => {
            // Arrange
            const env = await installCoach("kill -KILL $$");

            // Act
            const run = await spawnCoach([], { env });

            // Assert
            expect(run.exitCode).toBeNull();
        });
    });

    describe("when coach runs too long", () => {
        it("should stop it with SIGTERM at the timeout and report no exit code", async () => {
            // Arrange
            const env = await installCoach("exec sleep 30");

            // Act
            const started = Date.now();
            const run = await spawnCoach([], { env, timeoutMilliseconds: 100 });

            // Assert
            expect(run.exitCode).toBeNull();
            expect(Date.now() - started).toBeLessThan(5000);
        });

        it("should kill it with SIGKILL after a grace period when it ignores SIGTERM", async () => {
            // Arrange
            const env = await installCoachIgnoringSigterm();
            const timeout = 500;
            const grace = 300;

            // Act
            const started = Date.now();
            const run = await spawnCoach([], {
                env,
                timeoutMilliseconds: timeout,
                killGraceMilliseconds: grace,
            });
            const elapsed = Date.now() - started;

            // Assert
            expect(run.exitCode).toBeNull();
            expect(elapsed).toBeGreaterThanOrEqual(timeout + grace - 20);
            expect(elapsed).toBeLessThan(5000);
        });

        it("should leave no timer running once coach has finished", async () => {
            // Arrange
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            const env = await installCoach("exit 0");

            // Act
            await spawnCoach([], { env, timeoutMilliseconds: 60_000 });

            // Assert
            expect(vi.getTimerCount()).toBe(0);
        });

        it("should leave no timer running after it had to kill coach", async () => {
            // Arrange
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            const env = await installCoachIgnoringSigterm();
            const running = spawnCoach([], {
                env,
                timeoutMilliseconds: 50,
                killGraceMilliseconds: 50,
            });

            // Act
            await vi.advanceTimersByTimeAsync(50);
            await vi.advanceTimersByTimeAsync(50);
            await running;

            // Assert
            expect(vi.getTimerCount()).toBe(0);
        });

        it("should cancel the pending SIGKILL when coach stops on SIGTERM", async () => {
            // Arrange
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            const env = await installCoach("exec sleep 30");
            const running = spawnCoach([], {
                env,
                timeoutMilliseconds: 50,
                killGraceMilliseconds: 60_000,
            });

            // Act
            await vi.advanceTimersByTimeAsync(50);
            const run = await running;

            // Assert
            expect(run.exitCode).toBeNull();
            expect(vi.getTimerCount()).toBe(0);
        });

        it("should not stop a coach that finishes before the timeout", async () => {
            // Arrange
            const env = await installCoach("exit 0");

            // Act
            const run = await spawnCoach([], {
                env,
                timeoutMilliseconds: 60_000,
            });

            // Assert
            expect(run.exitCode).toBe(0);
        });
    });

    describe("when coach cannot be started", () => {
        it("should throw a GateError that says so, instead of returning a result", async () => {
            // Arrange
            // biome-ignore lint/style/useNamingConvention: environment variable name
            const env = { PATH: binDir };

            // Act
            const starting = spawnCoach([], { env });

            // Assert
            await expect(starting).rejects.toThrow(GateError);
            await expect(starting).rejects.toThrow(/could not run coach/);
        });
    });
});
