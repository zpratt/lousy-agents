import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { ShimResult } from "../src/gateways/shim.js";
import { runShim } from "../src/gateways/shim.js";
import { resolveMode } from "../src/lib/mode.js";

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

        it("should still resolve with the shim result when onComplete rejects", async () => {
            // Arrange
            const onComplete = vi
                .fn()
                .mockRejectedValue(new Error("telemetry failure"));

            // Act
            const result = await runShim({ command: "exit 0", onComplete });

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

    describe("given policy-check as the first argument", () => {
        it("should resolve to policy-check mode", () => {
            // Arrange
            const args = ["policy-check"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({ type: "policy-check" });
        });
    });

    describe("given policy-check with AGENTSHELL_PASSTHROUGH=1", () => {
        it("should resolve to policy-check mode, not passthrough", () => {
            // Arrange
            const args = ["policy-check"];
            // biome-ignore lint/style/useNamingConvention: env var name
            const env = { AGENTSHELL_PASSTHROUGH: "1" };

            // Act
            const mode = resolveMode(args, env);

            // Assert
            expect(mode).toEqual({ type: "policy-check" });
        });
    });

    describe("given policy --init as arguments", () => {
        it("should resolve to policy-init mode", () => {
            // Arrange
            const args = ["policy", "--init"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("policy-init");
        });
    });

    describe("given policy without --init flag", () => {
        it("should resolve to usage mode", () => {
            // Arrange
            const args = ["policy"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({ type: "usage" });
        });
    });

    describe("given policy --init with AGENTSHELL_PASSTHROUGH=1", () => {
        it("should resolve to policy-init mode, not passthrough", () => {
            // Arrange
            const args = ["policy", "--init"];
            // biome-ignore lint/style/useNamingConvention: env var name
            const env = { AGENTSHELL_PASSTHROUGH: "1" };

            // Act
            const mode = resolveMode(args, env);

            // Assert
            expect(mode.type).toBe("policy-init");
        });
    });

    describe("given policy --init with --model option", () => {
        it("should include the specified model in the mode", () => {
            // Arrange
            const args = ["policy", "--init", "--model=gpt-4.1"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("policy-init");
            if (mode.type === "policy-init") {
                expect(mode.model).toBe("gpt-4.1");
            }
        });
    });

    describe("given policy --init with invalid --model value", () => {
        it("should ignore a model containing shell metacharacters", () => {
            // Arrange
            const args = ["policy", "--init", "--model=;curl evil"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("policy-init");
            if (mode.type === "policy-init") {
                expect(mode.model).toBeUndefined();
            }
        });

        it("should ignore a model containing path traversal", () => {
            // Arrange
            const args = ["policy", "--init", "--model=../../exploit"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("policy-init");
            if (mode.type === "policy-init") {
                expect(mode.model).toBeUndefined();
            }
        });
    });

    describe("given policy --init without --model option", () => {
        it("should not include a model in the mode", () => {
            // Arrange
            const args = ["policy", "--init"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("policy-init");
            if (mode.type === "policy-init") {
                expect(mode.model).toBeUndefined();
            }
        });
    });

    describe("given 'record' as the first argument", () => {
        it("should resolve to record mode", () => {
            // Arrange
            const args = ["record"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({ type: "record" });
        });

        it("should take precedence over AGENTSHELL_PASSTHROUGH=1", () => {
            // Arrange
            const args = ["record"];
            // biome-ignore lint/style/useNamingConvention: env var name
            const env = { AGENTSHELL_PASSTHROUGH: "1" };

            // Act
            const mode = resolveMode(args, env);

            // Assert
            expect(mode).toEqual({ type: "record" });
        });
    });

    describe("given 'init' as the first argument", () => {
        it("should resolve to init mode with all flags false by default", () => {
            // Arrange
            const args = ["init"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode).toEqual({
                type: "init",
                flightRecorder: false,
                policy: false,
                noFlightRecorder: false,
                noPolicy: false,
                unknownArgs: [],
            });
        });

        it("should parse --flight-recorder flag", () => {
            // Arrange
            const args = ["init", "--flight-recorder"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("init");
            if (mode.type === "init") {
                expect(mode.flightRecorder).toBe(true);
                expect(mode.policy).toBe(false);
            }
        });

        it("should parse --policy flag", () => {
            // Arrange
            const args = ["init", "--policy"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("init");
            if (mode.type === "init") {
                expect(mode.policy).toBe(true);
            }
        });

        it("should parse --no-flight-recorder flag", () => {
            // Arrange
            const args = ["init", "--no-flight-recorder"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("init");
            if (mode.type === "init") {
                expect(mode.noFlightRecorder).toBe(true);
            }
        });

        it("should parse --no-policy flag", () => {
            // Arrange
            const args = ["init", "--no-policy"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("init");
            if (mode.type === "init") {
                expect(mode.noPolicy).toBe(true);
            }
        });

        it("should parse multiple flags together", () => {
            // Arrange
            const args = ["init", "--flight-recorder", "--policy"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("init");
            if (mode.type === "init") {
                expect(mode.flightRecorder).toBe(true);
                expect(mode.policy).toBe(true);
            }
        });

        it("should take precedence over AGENTSHELL_PASSTHROUGH=1", () => {
            // Arrange
            const args = ["init"];
            // biome-ignore lint/style/useNamingConvention: env var name
            const env = { AGENTSHELL_PASSTHROUGH: "1" };

            // Act
            const mode = resolveMode(args, env);

            // Assert
            expect(mode.type).toBe("init");
        });

        it("should collect unknown flags in unknownArgs", () => {
            // Arrange
            const args = ["init", "--flightrecorder", "--unknown"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("init");
            if (mode.type === "init") {
                expect(mode.unknownArgs).toEqual([
                    "--flightrecorder",
                    "--unknown",
                ]);
                expect(mode.flightRecorder).toBe(false);
            }
        });

        it("should separate known and unknown flags", () => {
            // Arrange
            const args = ["init", "--policy", "--typo"];

            // Act
            const mode = resolveMode(args, {});

            // Assert
            expect(mode.type).toBe("init");
            if (mode.type === "init") {
                expect(mode.policy).toBe(true);
                expect(mode.unknownArgs).toEqual(["--typo"]);
            }
        });
    });
});
