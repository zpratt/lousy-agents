import { describe, expect, it, vi } from "vitest";
import type { InitDeps, InitFlags } from "../src/init-command.js";
import { handleInit } from "../src/init-command.js";

function createDefaultFlags(overrides?: Partial<InitFlags>): InitFlags {
    return {
        flightRecorder: false,
        policy: false,
        noFlightRecorder: false,
        noPolicy: false,
        ...overrides,
    };
}

function createMockDeps(
    overrides?: Partial<InitDeps>,
): InitDeps & { stdout: string[]; stderr: string[] } {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
        getRepositoryRoot: vi.fn().mockReturnValue("/project"),
        writeStdout: vi.fn().mockImplementation((msg: string) => {
            stdout.push(msg);
        }),
        writeStderr: vi.fn().mockImplementation((msg: string) => {
            stderr.push(msg);
        }),
        readFile: vi
            .fn()
            .mockRejectedValue(
                Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
            ),
        writeFile: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        realpath: vi.fn().mockImplementation(async (p: string) => p),
        isTty: false,
        stdout,
        stderr,
        ...overrides,
    };
}

const VALID_HOOKS_CONFIG = {
    version: 1,
    hooks: {
        preToolUse: [
            {
                type: "command",
                bash: "agent-shell policy-check",
                timeoutSec: 30,
            },
        ],
        postToolUse: [
            {
                type: "command",
                bash: "agent-shell record",
                timeoutSec: 30,
            },
        ],
    },
};

const HOOKS_CONFIG_POLICY_ONLY = {
    version: 1,
    hooks: {
        preToolUse: [
            {
                type: "command",
                bash: "agent-shell policy-check",
                timeoutSec: 30,
            },
        ],
    },
};

describe("handleInit", () => {
    describe("given hooks.json does not exist", () => {
        describe("with non-TTY and no explicit flags", () => {
            it("should auto-enable all features and print stderr warning", async () => {
                // Arrange
                const flags = createDefaultFlags();
                const deps = createMockDeps({ isTty: false });

                // Act
                await handleInit(flags, deps);

                // Assert
                expect(deps.stderr.join("")).toContain("auto-enabling");
                expect(deps.stderr.join("")).toContain("flight recording");
                expect(deps.stderr.join("")).toContain("policy blocking");
                expect(deps.writeFile).toHaveBeenCalled();
            });
        });

        describe("with --flight-recorder flag", () => {
            it("should enable only flight recording", async () => {
                // Arrange
                const flags = createDefaultFlags({ flightRecorder: true });
                const deps = createMockDeps();

                // Act
                await handleInit(flags, deps);

                // Assert
                const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
                const hooksCall = writeFileCalls.find(([path]) =>
                    (path as string).includes("hooks.json"),
                );
                expect(hooksCall).toBeDefined();
                const config = JSON.parse(hooksCall?.[1] as string);
                expect(config.hooks.postToolUse).toHaveLength(1);
                // No policy flag, so no preToolUse (not already existing)
                expect(deps.stdout.join("")).toContain("flight recording");
            });
        });

        describe("with --policy flag", () => {
            it("should enable only policy blocking and scan project", async () => {
                // Arrange
                const flags = createDefaultFlags({ policy: true });
                const deps = createMockDeps();

                // Act
                await handleInit(flags, deps);

                // Assert
                expect(deps.stdout.join("")).toContain("policy blocking");
                expect(deps.stdout.join("")).toContain("Scanning project");
            });
        });

        describe("with --no-flight-recorder and --no-policy flags", () => {
            it("should select no features and print nothing-to-do message", async () => {
                // Arrange
                const flags = createDefaultFlags({
                    noFlightRecorder: true,
                    noPolicy: true,
                });
                const deps = createMockDeps();

                // Act
                await handleInit(flags, deps);

                // Assert
                expect(deps.stdout.join("")).toContain("No features selected");
                expect(deps.writeFile).not.toHaveBeenCalled();
            });
        });

        describe("with both --flight-recorder and --policy flags", () => {
            it("should enable both features", async () => {
                // Arrange
                const flags = createDefaultFlags({
                    flightRecorder: true,
                    policy: true,
                });
                const deps = createMockDeps();

                // Act
                await handleInit(flags, deps);

                // Assert
                const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
                const hooksCall = writeFileCalls.find(([path]) =>
                    (path as string).includes("hooks.json"),
                );
                const config = JSON.parse(hooksCall?.[1] as string);
                expect(config.hooks.preToolUse).toHaveLength(1);
                expect(config.hooks.postToolUse).toHaveLength(1);
                expect(deps.stdout.join("")).toContain("flight recording");
                expect(deps.stdout.join("")).toContain("policy blocking");
            });
        });
    });

    describe("given hooks.json exists with all features configured", () => {
        it("should inform the user and exit without writing", async () => {
            // Arrange
            const flags = createDefaultFlags();
            const deps = createMockDeps({
                readFile: vi
                    .fn()
                    .mockResolvedValue(JSON.stringify(VALID_HOOKS_CONFIG)),
            });

            // Act
            await handleInit(flags, deps);

            // Assert
            expect(deps.stdout.join("")).toContain(
                "All features already configured",
            );
            expect(deps.writeFile).not.toHaveBeenCalled();
        });
    });

    describe("given hooks.json exists with only policy configured", () => {
        describe("with --flight-recorder flag", () => {
            it("should add flight recording while preserving policy", async () => {
                // Arrange
                const flags = createDefaultFlags({ flightRecorder: true });
                const deps = createMockDeps({
                    readFile: vi
                        .fn()
                        .mockResolvedValue(
                            JSON.stringify(HOOKS_CONFIG_POLICY_ONLY),
                        ),
                });

                // Act
                await handleInit(flags, deps);

                // Assert
                const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
                const hooksCall = writeFileCalls.find(([path]) =>
                    (path as string).includes("hooks.json"),
                );
                const config = JSON.parse(hooksCall?.[1] as string);
                expect(config.hooks.preToolUse).toHaveLength(1);
                expect(config.hooks.postToolUse).toHaveLength(1);
            });
        });
    });

    describe("given interactive mode with prompt dependency", () => {
        it("should prompt for missing features and apply selections", async () => {
            // Arrange
            const flags = createDefaultFlags();
            const promptMock = vi
                .fn()
                .mockResolvedValueOnce(true) // Enable flight recording
                .mockResolvedValueOnce(false); // Skip policy
            const deps = createMockDeps({
                isTty: true,
                prompt: promptMock,
            });

            // Act
            await handleInit(flags, deps);

            // Assert
            expect(promptMock).toHaveBeenCalledTimes(2);
            expect(promptMock).toHaveBeenCalledWith(
                "Enable flight recording (postToolUse hook)?",
            );
            expect(promptMock).toHaveBeenCalledWith(
                "Enable policy blocking (preToolUse hook)?",
            );
            expect(deps.stdout.join("")).toContain("flight recording");
            expect(deps.stdout.join("")).not.toContain("policy blocking");
        });

        it("should only prompt for missing features when some exist", async () => {
            // Arrange
            const flags = createDefaultFlags();
            const promptMock = vi.fn().mockResolvedValueOnce(true);
            const deps = createMockDeps({
                isTty: true,
                prompt: promptMock,
                readFile: vi
                    .fn()
                    .mockResolvedValue(
                        JSON.stringify(HOOKS_CONFIG_POLICY_ONLY),
                    ),
            });

            // Act
            await handleInit(flags, deps);

            // Assert
            expect(promptMock).toHaveBeenCalledTimes(1);
            expect(promptMock).toHaveBeenCalledWith(
                "Enable flight recording (postToolUse hook)?",
            );
        });

        it("should do nothing when user declines all features", async () => {
            // Arrange
            const flags = createDefaultFlags();
            const promptMock = vi
                .fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false);
            const deps = createMockDeps({
                isTty: true,
                prompt: promptMock,
            });

            // Act
            await handleInit(flags, deps);

            // Assert
            expect(deps.stdout.join("")).toContain("No features selected");
            expect(deps.writeFile).not.toHaveBeenCalled();
        });
    });

    describe("given path containment violation", () => {
        it("should abort when hooks.json resolves outside repository root", async () => {
            // Arrange
            const flags = createDefaultFlags({ flightRecorder: true });
            const deps = createMockDeps({
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    if (p.includes("hooks.json")) {
                        return "/outside/hooks.json";
                    }
                    return p;
                }),
            });

            // Act
            await handleInit(flags, deps);

            // Assert
            expect(deps.stderr.join("")).toContain(
                "resolves outside repository root",
            );
        });
    });

    describe("given explicit flags override non-TTY auto-enable", () => {
        it("should not auto-enable when flags are provided even in non-TTY", async () => {
            // Arrange
            const flags = createDefaultFlags({
                flightRecorder: true,
                noPolicy: true,
            });
            const deps = createMockDeps({ isTty: false });

            // Act
            await handleInit(flags, deps);

            // Assert
            // Should NOT see the auto-enabling message since explicit flags were given
            expect(deps.stderr.join("")).not.toContain("auto-enabling");
            expect(deps.stdout.join("")).toContain("flight recording");
            expect(deps.stdout.join("")).not.toContain("policy blocking");
        });
    });
});
