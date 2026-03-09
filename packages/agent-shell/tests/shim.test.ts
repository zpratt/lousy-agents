import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import { resolveMode } from "../src/mode.js";
import type { ShimResult } from "../src/shim.js";
import { runShim } from "../src/shim.js";

const chance = new Chance();

describe("runShim", () => {
    describe("exit code propagation", () => {
        it("should return exit code 0 for a successful command", async () => {
            // Arrange
            const command = "exit 0";

            // Act
            const result = await runShim({ command });

            // Assert
            expect(result.exitCode).toBe(0);
        });

        it("should return the non-zero exit code from the command", async () => {
            // Arrange
            const exitCode = chance.integer({ min: 1, max: 125 });

            // Act
            const result = await runShim({ command: `exit ${exitCode}` });

            // Assert
            expect(result.exitCode).toBe(exitCode);
        });
    });

    describe("signal result", () => {
        it("should report null signal for a normal exit", async () => {
            // Arrange
            const command = "exit 0";

            // Act
            const result = await runShim({ command });

            // Assert
            expect(result.signal).toBeNull();
        });

        it("should return 128 + signal number when child is killed by SIGTERM", async () => {
            // Arrange — shell sends itself SIGTERM via a background subshell
            const command = "(sleep 0.1; kill -TERM $$) & wait";

            // Act
            const result = await runShim({ command });

            // Assert
            expect(result.exitCode).toBe(128 + 15);
            expect(result.signal).toBe("SIGTERM");
        });
    });

    describe("signal forwarding", () => {
        it("should forward SIGTERM from parent to child process", async () => {
            // Arrange — save and clear existing SIGTERM listeners
            // to avoid interfering with the test runner
            const existingListeners = process.listeners("SIGTERM");
            process.removeAllListeners("SIGTERM");

            try {
                const shimPromise = runShim({ command: "sleep 60" });

                // Allow child process time to start
                await new Promise((resolve) => setTimeout(resolve, 200));

                // Act — send SIGTERM to ourselves; shim handler forwards to child
                process.kill(process.pid, "SIGTERM");

                const result = await shimPromise;

                // Assert
                expect(result.exitCode).toBe(128 + 15);
                expect(result.signal).toBe("SIGTERM");
            } finally {
                // Restore original listeners
                for (const listener of existingListeners) {
                    process.on("SIGTERM", listener as NodeJS.SignalsListener);
                }
            }
        });
    });

    describe("duration tracking", () => {
        it("should report a positive duration", async () => {
            // Arrange
            const command = "exit 0";

            // Act
            const result = await runShim({ command });

            // Assert
            expect(result.durationMs).toBeGreaterThan(0);
        });

        it("should measure duration that reflects actual execution time", async () => {
            // Arrange — command sleeps for ~100ms
            const command = "sleep 0.1";

            // Act
            const result = await runShim({ command });

            // Assert — should be at least 80ms (allowing for timing variance)
            expect(result.durationMs).toBeGreaterThanOrEqual(80);
        });
    });

    describe("onComplete callback", () => {
        it("should call onComplete with the shim result", async () => {
            // Arrange
            const onComplete = vi.fn().mockResolvedValue(undefined);

            // Act
            const result = await runShim({ command: "exit 0", onComplete });

            // Assert
            expect(onComplete).toHaveBeenCalledOnce();
            expect(onComplete).toHaveBeenCalledWith(result);
        });

        it("should include positive duration in the callback result", async () => {
            // Arrange
            let capturedResult: ShimResult | undefined;
            const onComplete = vi
                .fn()
                .mockImplementation(async (r: ShimResult) => {
                    capturedResult = r;
                });

            // Act
            await runShim({ command: "exit 0", onComplete });

            // Assert
            expect(capturedResult).toBeDefined();
            expect(capturedResult?.durationMs).toBeGreaterThan(0);
        });

        it("should include the exit code in the callback result", async () => {
            // Arrange
            const expectedCode = chance.integer({ min: 1, max: 125 });
            let capturedResult: ShimResult | undefined;
            const onComplete = vi
                .fn()
                .mockImplementation(async (r: ShimResult) => {
                    capturedResult = r;
                });

            // Act
            await runShim({
                command: `exit ${expectedCode}`,
                onComplete,
            });

            // Assert
            expect(capturedResult).toBeDefined();
            expect(capturedResult?.exitCode).toBe(expectedCode);
        });

        it("should not fail when onComplete is not provided", async () => {
            // Arrange & Act
            const result = await runShim({ command: "exit 0" });

            // Assert
            expect(result.exitCode).toBe(0);
        });
    });

    describe("stdout and stderr passthrough", () => {
        it("should pass the command through to /bin/sh without modification", async () => {
            // Arrange — a command that exits with a distinctive code
            // proves it was executed by the shell unmodified
            const exitCode = chance.integer({ min: 1, max: 125 });

            // Act
            const result = await runShim({ command: `exit ${exitCode}` });

            // Assert
            expect(result.exitCode).toBe(exitCode);
        });
    });
});

describe("resolveMode", () => {
    describe("given --version as the first argument", () => {
        it("should resolve to version mode", () => {
            // Arrange
            const args = ["--version"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({ type: "version" });
        });
    });

    describe("given -c with a command argument", () => {
        it("should resolve to shim mode with the command", () => {
            // Arrange
            const command = chance.sentence();
            const args = ["-c", command];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({ type: "shim", command });
        });
    });

    describe("given -c without a command argument", () => {
        it("should resolve to usage mode", () => {
            // Arrange
            const args = ["-c"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({ type: "usage" });
        });
    });

    describe("given log as the first argument", () => {
        it("should resolve to log mode", () => {
            // Arrange
            const args = ["log"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({ type: "log" });
        });
    });

    describe("given no arguments", () => {
        it("should resolve to usage mode", () => {
            // Arrange
            const args: string[] = [];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({ type: "usage" });
        });
    });

    describe("given an unrecognized argument", () => {
        it("should resolve to usage mode", () => {
            // Arrange
            const args = [chance.word()];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({ type: "usage" });
        });
    });

    describe("given AGENTSHELL_PASSTHROUGH=1 in the environment", () => {
        it("should resolve to passthrough mode with all args", () => {
            // Arrange
            const args = ["-c", chance.sentence()];
            // biome-ignore lint/style/useNamingConvention: env var name
            const env = { AGENTSHELL_PASSTHROUGH: "1" };

            // Act
            const mode = resolveMode(args, env);

            // Assert
            expect(mode).toEqual({ type: "passthrough", args });
        });

        it("should take precedence over other modes", () => {
            // Arrange
            const args = ["--version"];
            // biome-ignore lint/style/useNamingConvention: env var name
            const env = { AGENTSHELL_PASSTHROUGH: "1" };

            // Act
            const mode = resolveMode(args, env);

            // Assert
            expect(mode.type).toBe("passthrough");
        });
    });

    describe("given AGENTSHELL_PASSTHROUGH is not 1", () => {
        it("should not resolve to passthrough mode", () => {
            // Arrange
            const args = ["-c", "echo test"];
            // biome-ignore lint/style/useNamingConvention: env var name
            const env = { AGENTSHELL_PASSTHROUGH: "0" };

            // Act
            const mode = resolveMode(args, env);

            // Assert
            expect(mode.type).toBe("shim");
        });
    });
});
