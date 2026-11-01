import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

    interface StubbornCoach {
        readonly env: NodeJS.ProcessEnv;
        /** Appears once the stub has installed its SIGTERM handler */
        readonly readyFile: string;
        /** Appears when the stub receives SIGTERM, which it then ignores */
        readonly termFile: string;
        /** Appears when the stub stops by itself; a SIGKILL leaves no trace */
        readonly stoppedFile: string;
    }

    async function installCoachIgnoringSigterm(): Promise<StubbornCoach> {
        const readyFile = join(workDir, "ready");
        const termFile = join(workDir, "received-sigterm");
        const stoppedFile = join(workDir, "stopped");
        const executable = join(binDir, "coach");
        await writeFile(
            executable,
            `#!${process.execPath}
const fs = require("node:fs");
// The parent is captured before anything signals ready, so a test that kills the
// parent once the ready file appears cannot beat this line. A parent that died
// even earlier leaves ppid at 1, which never changes again, so ppid 1 also stops
// the stub. That depends on the system handing orphans to process 1, which a
// container's init or a subreaper changes, so it is checked by hand, not here.
const parent = process.ppid;
process.on("SIGTERM", () => fs.writeFileSync(${JSON.stringify(termFile)}, "x"));
process.on("exit", () => {
    // Stopping because its files are gone means its directory is being removed
    // right now, and a marker written then makes that removal fail as not empty.
    if (!fs.existsSync(${JSON.stringify(readyFile)})) {
        return;
    }
    try {
        fs.writeFileSync(${JSON.stringify(stoppedFile)}, "x");
    } catch {
        // its directory is gone
    }
});
// SIGKILL is the only way the code under test stops this, so a test that fails
// first must not leave it running: it stops once its files are gone or its parent is.
fs.writeFileSync(${JSON.stringify(readyFile)}, "x");
setInterval(() => {
    if (process.ppid === 1 || process.ppid !== parent || !fs.existsSync(${JSON.stringify(readyFile)})) {
        process.exit(0);
    }
}, 100);
`,
        );
        await chmod(executable, 0o755);
        return {
            env: {
                // biome-ignore lint/style/useNamingConvention: environment variable name
                PATH: `${binDir}${delimiter}/usr/bin${delimiter}/bin`,
            },
            readyFile,
            termFile,
            stoppedFile,
        };
    }

    /** Lets real I/O events (a child's exit) arrive while setTimeout is faked. */
    async function letRealEventsRun(milliseconds = 150): Promise<void> {
        const until = Date.now() + milliseconds;
        while (Date.now() < until) {
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
    }

    /** Waits on real I/O, so it works while setTimeout is faked. */
    async function waitForFile(
        path: string,
        withinMilliseconds = 20_000,
    ): Promise<void> {
        const deadline = Date.now() + withinMilliseconds;
        while (!existsSync(path)) {
            if (Date.now() > deadline) {
                throw new Error(`timed out waiting for ${path}`);
            }
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
    }

    describe("the stub coach that ignores SIGTERM", () => {
        it("should stop by itself when its parent dies, so an interrupted test run cannot leave it running", async () => {
            // Arrange
            const coach = await installCoachIgnoringSigterm();
            const parent = spawn(
                process.execPath,
                [
                    "-e",
                    `require("node:child_process").spawn(${JSON.stringify(join(binDir, "coach"))}, { stdio: "ignore" }); setInterval(() => {}, 1000);`,
                ],
                { stdio: "ignore" },
            );
            try {
                await waitForFile(coach.readyFile);

                // Act
                parent.kill("SIGKILL");

                // Assert
                await waitForFile(coach.stoppedFile, 3000);
            } finally {
                parent.kill("SIGKILL");
            }
        });

        it("should stop by itself once its test has removed the files it was given, so a failed test cannot leave it running", async () => {
            // Arrange
            const coach = await installCoachIgnoringSigterm();
            const stub = spawn(join(binDir, "coach"), { stdio: "ignore" });
            const stopped = new Promise<string>((resolve) => {
                stub.once("exit", () => resolve("stopped"));
            });
            const stillRunning = new Promise<string>((resolve) => {
                setTimeout(() => resolve("still running"), 3000);
            });
            try {
                await waitForFile(coach.readyFile);

                // Act
                await rm(workDir, { recursive: true, force: true });

                // Assert
                expect(await Promise.race([stopped, stillRunning])).toBe(
                    "stopped",
                );
            } finally {
                stub.kill("SIGKILL");
            }
        });
    });

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

        it.each([
            ["the default periods", {}, 10 * 60 * 1000, 10 * 1000],
            [
                "the periods it is given",
                { timeoutMilliseconds: 700, killGraceMilliseconds: 300 },
                700,
                300,
            ],
        ])(
            "should send SIGTERM exactly at the timeout, then SIGKILL exactly after the grace period, with %s",
            async (_label, options, timeout, grace) => {
                // Arrange
                vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
                const coach = await installCoachIgnoringSigterm();
                let settled = false;
                const running = spawnCoach([], {
                    env: coach.env,
                    ...options,
                }).then((run) => {
                    settled = true;
                    return run;
                });
                await waitForFile(coach.readyFile);

                // Act / Assert: one millisecond short of the timeout, nothing happens
                await vi.advanceTimersByTimeAsync(timeout - 1);
                await letRealEventsRun();
                expect(existsSync(coach.termFile)).toBe(false);

                // the timeout sends SIGTERM, which the stub ignores
                await vi.advanceTimersByTimeAsync(1);
                await waitForFile(coach.termFile);
                expect(settled).toBe(false);

                // one millisecond short of the grace period, it is still running
                await vi.advanceTimersByTimeAsync(grace - 1);
                await letRealEventsRun();
                expect(settled).toBe(false);

                // the grace period ends with SIGKILL
                await vi.advanceTimersByTimeAsync(1);
                const run = await running;
                expect(run.exitCode).toBeNull();
                expect(vi.getTimerCount()).toBe(0);
            },
        );

        it("should leave no timer running once coach has finished", async () => {
            // Arrange
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            const env = await installCoach("exit 0");

            // Act
            await spawnCoach([], { env, timeoutMilliseconds: 60_000 });

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
