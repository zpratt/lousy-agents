import { describe, expect, it, vi } from "vitest";
import type { InitDeps, InitFlags } from "../src/init-command.js";
import { ensureAgentShellAllowed, handleInit } from "../src/init-command.js";

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
        rename: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        realpath: vi.fn().mockImplementation(async (p: string) => p),
        scanProject: vi.fn().mockResolvedValue({
            scripts: [],
            workflowCommands: [],
            miseTasks: [],
            languages: [],
        }),
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

const HOOKS_CONFIG_FLIGHT_RECORDER_ONLY = {
    version: 1,
    hooks: {
        postToolUse: [
            {
                type: "command",
                bash: "agent-shell record",
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
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
                expect(deps.stderr.join("")).toContain("auto-enabling");
                expect(deps.stderr.join("")).toContain("flight recording");
                expect(deps.stderr.join("")).toContain("policy blocking");
                expect(deps.writeFile).toHaveBeenCalled();
                const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
                const hooksCall = writeFileCalls.find(([path]) =>
                    (path as string).includes("hooks.json"),
                );
                expect(hooksCall).toBeDefined();
                const config = JSON.parse(hooksCall?.[1] as string);
                expect(config.hooks.preToolUse).toHaveLength(1);
                expect(config.hooks.postToolUse).toHaveLength(1);
            });
        });

        describe("with --flight-recorder flag", () => {
            it("should enable only flight recording without adding policy", async () => {
                // Arrange
                const flags = createDefaultFlags({ flightRecorder: true });
                const deps = createMockDeps();

                // Act
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
                const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
                const hooksCall = writeFileCalls.find(([path]) =>
                    (path as string).includes("hooks.json"),
                );
                expect(hooksCall).toBeDefined();
                const config = JSON.parse(hooksCall?.[1] as string);
                expect(config.hooks.postToolUse).toHaveLength(1);
                // Explicit flag mode: unspecified features are NOT added
                expect(config.hooks.preToolUse).toBeUndefined();
                expect(deps.stdout.join("")).toContain("flight recording");
                expect(deps.stdout.join("")).not.toContain("policy blocking");
            });
        });

        describe("with --policy flag", () => {
            it("should enable only policy blocking without adding flight recording", async () => {
                // Arrange
                const flags = createDefaultFlags({ policy: true });
                const deps = createMockDeps();

                // Act
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
                const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
                const hooksCall = writeFileCalls.find(([path]) =>
                    (path as string).includes("hooks.json"),
                );
                expect(hooksCall).toBeDefined();
                const config = JSON.parse(hooksCall?.[1] as string);
                expect(config.hooks.preToolUse).toHaveLength(1);
                // Explicit flag mode: unspecified features are NOT added
                expect(config.hooks.postToolUse).toBeUndefined();
                expect(deps.stdout.join("")).toContain("policy blocking");
                expect(deps.stdout.join("")).not.toContain("flight recording");
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
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
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
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
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
        describe("with conflicting --flight-recorder and --no-flight-recorder flags", () => {
            it("should let --no-flight-recorder take precedence", async () => {
                // Arrange
                const flags = createDefaultFlags({
                    flightRecorder: true,
                    noFlightRecorder: true,
                    policy: true,
                });
                const deps = createMockDeps();

                // Act
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
                const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
                const hooksCall = writeFileCalls.find(([path]) =>
                    (path as string).includes("hooks.json"),
                );
                expect(hooksCall).toBeDefined();
                const config = JSON.parse(hooksCall?.[1] as string);
                // --no-flight-recorder wins: no postToolUse hook
                expect(config.hooks.postToolUse).toBeUndefined();
                // --policy still applies
                expect(config.hooks.preToolUse).toHaveLength(1);
            });
        });
        describe("with conflicting --policy and --no-policy flags", () => {
            it("should let --no-policy take precedence", async () => {
                // Arrange
                const flags = createDefaultFlags({
                    policy: true,
                    noPolicy: true,
                    flightRecorder: true,
                });
                const deps = createMockDeps();

                // Act
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
                const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
                const hooksCall = writeFileCalls.find(([path]) =>
                    (path as string).includes("hooks.json"),
                );
                expect(hooksCall).toBeDefined();
                const config = JSON.parse(hooksCall?.[1] as string);
                // --no-policy wins: no preToolUse hook
                expect(config.hooks.preToolUse).toBeUndefined();
                // --flight-recorder still applies
                expect(config.hooks.postToolUse).toHaveLength(1);
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
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(deps.stdout.join("")).toContain(
                "All features already configured",
            );
            expect(deps.writeFile).not.toHaveBeenCalled();
        });
    });

    describe("given hooks.json exists but contains invalid JSON", () => {
        it("should abort with an error instead of overwriting", async () => {
            // Arrange
            const flags = createDefaultFlags({ flightRecorder: true });
            const deps = createMockDeps({
                readFile: vi.fn().mockResolvedValue("not valid json{"),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(false);
            expect(deps.stderr.join("")).toContain(
                "failed to read existing hooks.json",
            );
            expect(deps.writeFile).not.toHaveBeenCalled();
        });
    });

    describe("given hooks.json exists with valid JSON but invalid schema", () => {
        it("should abort with an error instead of overwriting", async () => {
            // Arrange — version 2 is not valid per HooksConfigSchema
            const flags = createDefaultFlags({ flightRecorder: true });
            const deps = createMockDeps({
                readFile: vi
                    .fn()
                    .mockResolvedValue(
                        JSON.stringify({ version: 2, hooks: {} }),
                    ),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(false);
            expect(deps.stderr.join("")).toContain(
                "failed to read existing hooks.json",
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
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
                const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
                const hooksCall = writeFileCalls.find(([path]) =>
                    (path as string).includes("hooks.json"),
                );
                const config = JSON.parse(hooksCall?.[1] as string);
                expect(config.hooks.preToolUse).toHaveLength(1);
                expect(config.hooks.postToolUse).toHaveLength(1);
            });
        });

        describe("with --policy flag (already configured)", () => {
            it("should detect no-op and skip writing", async () => {
                // Arrange
                const flags = createDefaultFlags({ policy: true });
                const deps = createMockDeps({
                    readFile: vi
                        .fn()
                        .mockResolvedValue(
                            JSON.stringify(HOOKS_CONFIG_POLICY_ONLY),
                        ),
                });

                // Act
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
                expect(deps.stdout.join("")).toContain("already configured");
                expect(deps.writeFile).not.toHaveBeenCalled();
            });
        });
    });

    describe("given hooks.json exists with only flight recording configured", () => {
        describe("with --flight-recorder flag (already configured)", () => {
            it("should detect no-op and skip writing", async () => {
                // Arrange
                const flags = createDefaultFlags({ flightRecorder: true });
                const deps = createMockDeps({
                    readFile: vi
                        .fn()
                        .mockResolvedValue(
                            JSON.stringify(HOOKS_CONFIG_FLIGHT_RECORDER_ONLY),
                        ),
                });

                // Act
                const ok = await handleInit(flags, deps);

                // Assert
                expect(ok).toBe(true);
                expect(deps.stdout.join("")).toContain("already configured");
                expect(deps.writeFile).not.toHaveBeenCalled();
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
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(promptMock).toHaveBeenCalledTimes(2);
            expect(promptMock).toHaveBeenCalledWith(
                "Enable flight recording to capture all agent tool usage?",
            );
            expect(promptMock).toHaveBeenCalledWith(
                "Enable policy-based command blocking?",
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
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(promptMock).toHaveBeenCalledTimes(1);
            expect(promptMock).toHaveBeenCalledWith(
                "Enable flight recording to capture all agent tool usage?",
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
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(deps.stdout.join("")).toContain("No features selected");
            expect(deps.writeFile).not.toHaveBeenCalled();
        });
    });

    describe("given path containment violation", () => {
        it("should abort and return false when hooks.json resolves outside repository root", async () => {
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
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(false);
            expect(deps.stderr.join("")).toContain(
                "resolves outside repository root",
            );
        });
    });

    describe("given policy.json write fails after hooks.json succeeds", () => {
        it("should return false when policy file write fails", async () => {
            // Arrange
            const flags = createDefaultFlags({ policy: true });
            const deps = createMockDeps({
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    // Fail containment only for policy.json path
                    if (p.includes("policy.json")) {
                        return "/outside/policy.json";
                    }
                    return p;
                }),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(false);
            expect(deps.stderr.join("")).toContain(
                "resolves outside repository root",
            );
        });
    });

    describe("given post-mkdir symlink attack on parent directory", () => {
        it("should abort when parent directory resolves outside repo root after mkdir", async () => {
            // Arrange
            const flags = createDefaultFlags({ flightRecorder: true });
            let mkdirCalled = false;
            const deps = createMockDeps({
                mkdir: vi.fn().mockImplementation(async () => {
                    mkdirCalled = true;
                }),
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    // After mkdir, the parent directory is a symlink to outside
                    if (
                        mkdirCalled &&
                        (p as string).includes("agent-shell") &&
                        !(p as string).includes(".json")
                    ) {
                        return "/outside/evil-dir";
                    }
                    return p;
                }),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(false);
            expect(deps.stderr.join("")).toContain(
                "parent directory resolves outside repository root after mkdir",
            );
            expect(deps.writeFile).not.toHaveBeenCalled();
        });
    });

    describe("given hooks.json exists with non-agent-shell hooks", () => {
        it("should not treat other hooks as agent-shell features", async () => {
            // Arrange
            const otherHooksConfig = {
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command",
                            bash: "some-other-tool check",
                            timeoutSec: 10,
                        },
                    ],
                    postToolUse: [
                        {
                            type: "command",
                            bash: "another-tool log",
                            timeoutSec: 10,
                        },
                    ],
                },
            };
            const flags = createDefaultFlags({ flightRecorder: true });
            const deps = createMockDeps({
                readFile: vi
                    .fn()
                    .mockResolvedValue(JSON.stringify(otherHooksConfig)),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
            const hooksCall = writeFileCalls.find(([path]) =>
                (path as string).includes("hooks.json"),
            );
            expect(hooksCall).toBeDefined();
            const config = JSON.parse(hooksCall?.[1] as string);
            // Should preserve the existing hook AND add agent-shell record
            expect(config.hooks.postToolUse).toHaveLength(2);
            expect(config.hooks.postToolUse[0].bash).toBe("another-tool log");
            expect(config.hooks.postToolUse[1].bash).toBe("agent-shell record");
            // preToolUse should be preserved without adding agent-shell policy-check
            expect(config.hooks.preToolUse).toHaveLength(1);
            expect(config.hooks.preToolUse[0].bash).toBe(
                "some-other-tool check",
            );
        });
    });

    describe("given hooks.json with powershell agent-shell hooks", () => {
        it("should detect agent-shell hooks in powershell field", async () => {
            // Arrange
            const powershellConfig = {
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command",
                            powershell: "agent-shell policy-check",
                            timeoutSec: 30,
                        },
                    ],
                    postToolUse: [
                        {
                            type: "command",
                            powershell: "agent-shell record",
                            timeoutSec: 30,
                        },
                    ],
                },
            };
            const flags = createDefaultFlags();
            const deps = createMockDeps({
                readFile: vi
                    .fn()
                    .mockResolvedValue(JSON.stringify(powershellConfig)),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(deps.stdout.join("")).toContain(
                "All features already configured",
            );
            expect(deps.writeFile).not.toHaveBeenCalled();
        });
    });

    describe("given hooks.json with sessionStart hooks", () => {
        it("should preserve sessionStart hooks when adding features", async () => {
            // Arrange
            const configWithSessionStart = {
                version: 1,
                hooks: {
                    sessionStart: [
                        {
                            type: "command",
                            bash: "echo session started",
                            timeoutSec: 5,
                        },
                    ],
                },
            };
            const flags = createDefaultFlags({
                flightRecorder: true,
                policy: true,
            });
            const deps = createMockDeps({
                readFile: vi
                    .fn()
                    .mockResolvedValue(JSON.stringify(configWithSessionStart)),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
            const hooksCall = writeFileCalls.find(([path]) =>
                (path as string).includes("hooks.json"),
            );
            const config = JSON.parse(hooksCall?.[1] as string);
            // sessionStart should be preserved
            expect(config.hooks.sessionStart).toHaveLength(1);
            expect(config.hooks.sessionStart[0].bash).toBe(
                "echo session started",
            );
            // New hooks should be added
            expect(config.hooks.preToolUse).toHaveLength(1);
            expect(config.hooks.postToolUse).toHaveLength(1);
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
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            // Should NOT see the auto-enabling message since explicit flags were given
            expect(deps.stderr.join("")).not.toContain("auto-enabling");
            expect(deps.stdout.join("")).toContain("flight recording");
            expect(deps.stdout.join("")).not.toContain("policy blocking");
        });
    });

    describe("given TTY without prompt dependency", () => {
        it("should auto-enable all missing features as fallback", async () => {
            // Arrange
            const flags = createDefaultFlags();
            const deps = createMockDeps({
                isTty: true,
                prompt: undefined,
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(deps.writeFile).toHaveBeenCalled();
            const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
            const hooksCall = writeFileCalls.find(([path]) =>
                (path as string).includes("hooks.json"),
            );
            expect(hooksCall).toBeDefined();
            const config = JSON.parse(hooksCall?.[1] as string);
            expect(config.hooks.preToolUse).toHaveLength(1);
            expect(config.hooks.postToolUse).toHaveLength(1);
        });
    });

    describe("given writeFile throws EACCES", () => {
        it("should propagate the error to the caller", async () => {
            // Arrange
            const flags = createDefaultFlags({ flightRecorder: true });
            const deps = createMockDeps({
                writeFile: vi
                    .fn()
                    .mockRejectedValue(
                        Object.assign(new Error("EACCES"), { code: "EACCES" }),
                    ),
            });

            // Act & Assert
            await expect(handleInit(flags, deps)).rejects.toThrow("EACCES");
        });
    });

    describe("given rename fails after writeFile succeeds", () => {
        it("should attempt to clean up the orphaned temp file", async () => {
            // Arrange — rename rejects, so the temp file is orphaned
            const flags = createDefaultFlags({ flightRecorder: true });
            const unlinkMock = vi.fn().mockResolvedValue(undefined);
            const deps = createMockDeps({
                rename: vi
                    .fn()
                    .mockRejectedValue(new Error("EPERM: rename denied")),
                unlink: unlinkMock,
            });

            // Act & Assert — the error should propagate
            await expect(handleInit(flags, deps)).rejects.toThrow("EPERM");
            // The temp file should be cleaned up via unlink
            expect(unlinkMock).toHaveBeenCalledTimes(1);
            expect(unlinkMock).toHaveBeenCalledWith(
                expect.stringMatching(/\.tmp$/),
            );
        });
    });

    describe("given policy.json already exists when enabling policy", () => {
        it("should patch policy.json with missing agent-shell allow entries", async () => {
            // Arrange
            const flags = createDefaultFlags({ policy: true });
            const existingPolicy = JSON.stringify({
                allow: ["customized-rule *"],
                deny: ["rm -rf *"],
            });
            const deps = createMockDeps({
                readFile: vi.fn().mockImplementation(async (p: string) => {
                    if ((p as string).includes("hooks.json")) {
                        throw Object.assign(new Error("ENOENT"), {
                            code: "ENOENT",
                        });
                    }
                    if ((p as string).includes("policy.json")) {
                        return existingPolicy;
                    }
                    throw Object.assign(new Error("ENOENT"), {
                        code: "ENOENT",
                    });
                }),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(deps.stdout.join("")).not.toContain("Scanning project");
            // policy.json should be written with patched allow list
            const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
            const policyCall = writeFileCalls.find(([path]) =>
                (path as string).includes("policy.json"),
            );
            expect(policyCall).toBeDefined();
            const patchedPolicy = JSON.parse(policyCall?.[1] as string);
            expect(patchedPolicy.allow).toContain("agent-shell policy-check");
            expect(patchedPolicy.allow).toContain("agent-shell record");
            // Preserves existing user rules
            expect(patchedPolicy.allow).toContain("customized-rule *");
            expect(patchedPolicy.deny).toEqual(["rm -rf *"]);
        });

        it("should skip patching when agent-shell entries already present", async () => {
            // Arrange
            const flags = createDefaultFlags({ policy: true });
            const existingPolicy = JSON.stringify({
                allow: [
                    "agent-shell policy-check",
                    "agent-shell record",
                    "npm test",
                ],
                deny: ["rm -rf *"],
            });
            const deps = createMockDeps({
                readFile: vi.fn().mockImplementation(async (p: string) => {
                    if ((p as string).includes("hooks.json")) {
                        throw Object.assign(new Error("ENOENT"), {
                            code: "ENOENT",
                        });
                    }
                    if ((p as string).includes("policy.json")) {
                        return existingPolicy;
                    }
                    throw Object.assign(new Error("ENOENT"), {
                        code: "ENOENT",
                    });
                }),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(deps.stdout.join("")).toContain(
                "Policy already exists with agent-shell rules; skipping policy.json generation",
            );
            // policy.json should NOT be written
            const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
            const policyCall = writeFileCalls.find(([path]) =>
                (path as string).includes("policy.json"),
            );
            expect(policyCall).toBeUndefined();
        });
    });

    describe("given policy.json readFile throws EACCES during existence check", () => {
        it("should propagate the error", async () => {
            // Arrange
            const flags = createDefaultFlags({ policy: true });
            const deps = createMockDeps({
                readFile: vi.fn().mockImplementation(async (p: string) => {
                    if ((p as string).includes("hooks.json")) {
                        throw Object.assign(new Error("ENOENT"), {
                            code: "ENOENT",
                        });
                    }
                    if ((p as string).includes("policy.json")) {
                        throw Object.assign(new Error("EACCES"), {
                            code: "EACCES",
                        });
                    }
                    throw Object.assign(new Error("ENOENT"), {
                        code: "ENOENT",
                    });
                }),
            });

            // Act & Assert
            await expect(handleInit(flags, deps)).rejects.toThrow("EACCES");
        });
    });

    describe("given corrupted policy.json when enabling policy", () => {
        it("should warn on stderr and regenerate policy", async () => {
            // Arrange
            const flags = createDefaultFlags({ policy: true });
            const deps = createMockDeps({
                readFile: vi.fn().mockImplementation(async (p: string) => {
                    if ((p as string).includes("hooks.json")) {
                        throw Object.assign(new Error("ENOENT"), {
                            code: "ENOENT",
                        });
                    }
                    if ((p as string).includes("policy.json")) {
                        return "{broken json";
                    }
                    throw Object.assign(new Error("ENOENT"), {
                        code: "ENOENT",
                    });
                }),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(deps.stderr.join("")).toContain(
                "existing policy.json is invalid",
            );
            expect(deps.stderr.join("")).toContain("regenerating");
            // policy.json should be written with regenerated content
            const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
            const policyCall = writeFileCalls.find(([path]) =>
                (path as string).includes("policy.json"),
            );
            expect(policyCall).toBeDefined();
        });

        it("should regenerate when schema validation fails on existing policy", async () => {
            // Arrange
            const flags = createDefaultFlags({ policy: true });
            const invalidPolicy = JSON.stringify({
                allow: ["npm test"],
                deny: ["rm -rf *"],
                unknownField: "should fail strict schema",
            });
            const deps = createMockDeps({
                readFile: vi.fn().mockImplementation(async (p: string) => {
                    if ((p as string).includes("hooks.json")) {
                        throw Object.assign(new Error("ENOENT"), {
                            code: "ENOENT",
                        });
                    }
                    if ((p as string).includes("policy.json")) {
                        return invalidPolicy;
                    }
                    throw Object.assign(new Error("ENOENT"), {
                        code: "ENOENT",
                    });
                }),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(true);
            expect(deps.stderr.join("")).toContain(
                "existing policy.json is invalid",
            );
            expect(deps.stderr.join("")).toContain("regenerating");
            expect(deps.stdout.join("")).toContain("Scanning project");
            // policy.json should be written with regenerated content
            const writeFileCalls = vi.mocked(deps.writeFile).mock.calls;
            const policyCall = writeFileCalls.find(([path]) =>
                (path as string).includes("policy.json"),
            );
            expect(policyCall).toBeDefined();
        });
    });

    describe("given realpath(repoRoot) fails", () => {
        it("should print diagnostic stderr and return false", async () => {
            // Arrange
            const flags = createDefaultFlags({ flightRecorder: true });
            const deps = createMockDeps({
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    if (p === "/project") {
                        throw Object.assign(new Error("ENOENT"), {
                            code: "ENOENT",
                        });
                    }
                    return p;
                }),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(false);
            expect(deps.stderr.join("")).toContain(
                "unreachable or cannot be canonicalized",
            );
        });
    });

    describe("given realpath(repoRoot) throws EACCES in validatePathContainment", () => {
        it("should propagate the EACCES error instead of swallowing it", async () => {
            // Arrange — EACCES is non-recoverable and must propagate
            const flags = createDefaultFlags({ flightRecorder: true });
            const deps = createMockDeps({
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    if (p === "/project") {
                        throw Object.assign(new Error("EACCES"), {
                            code: "EACCES",
                        });
                    }
                    return p;
                }),
            });

            // Act & Assert
            await expect(handleInit(flags, deps)).rejects.toThrow("EACCES");
        });
    });

    describe("given realpath throws EACCES on target file path", () => {
        it("should propagate the error from validatePathContainment", async () => {
            // Arrange
            const flags = createDefaultFlags({ flightRecorder: true });
            const deps = createMockDeps({
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    if ((p as string).includes("hooks.json")) {
                        throw Object.assign(new Error("EACCES"), {
                            code: "EACCES",
                        });
                    }
                    return p;
                }),
            });

            // Act & Assert
            await expect(handleInit(flags, deps)).rejects.toThrow("EACCES");
        });
    });

    describe("given realpath throws EACCES on parent dir after mkdir", () => {
        it("should propagate the error from writeConfigFile post-mkdir check", async () => {
            // Arrange
            const flags = createDefaultFlags({ flightRecorder: true });
            let mkdirCalled = false;
            const deps = createMockDeps({
                mkdir: vi.fn().mockImplementation(async () => {
                    mkdirCalled = true;
                }),
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    if (
                        mkdirCalled &&
                        (p as string).includes("agent-shell") &&
                        !(p as string).includes(".json")
                    ) {
                        throw Object.assign(new Error("EACCES"), {
                            code: "EACCES",
                        });
                    }
                    return p;
                }),
            });

            // Act & Assert
            await expect(handleInit(flags, deps)).rejects.toThrow("EACCES");
        });
    });

    describe("given realpath(repoRoot) fails only in writeConfigFile post-mkdir", () => {
        it("should return false with diagnostic when second repoRoot canonicalization fails with ENOENT", async () => {
            // Arrange — first realpath(/project) succeeds in validatePathContainment,
            // second realpath(/project) fails in writeConfigFile post-mkdir check
            const flags = createDefaultFlags({ flightRecorder: true });
            let repoRootCallCount = 0;
            const deps = createMockDeps({
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    if (p === "/project") {
                        repoRootCallCount++;
                        if (repoRootCallCount > 1) {
                            throw Object.assign(new Error("ENOENT"), {
                                code: "ENOENT",
                            });
                        }
                    }
                    return p;
                }),
            });

            // Act
            const ok = await handleInit(flags, deps);

            // Assert
            expect(ok).toBe(false);
            expect(deps.stderr.join("")).toContain(
                "unreachable or cannot be canonicalized",
            );
        });
    });

    describe("given realpath(repoRoot) throws EACCES in writeConfigFile post-mkdir", () => {
        it("should propagate the EACCES error instead of swallowing it", async () => {
            // Arrange — first realpath(/project) succeeds in validatePathContainment,
            // second realpath(/project) fails with EACCES in writeConfigFile post-mkdir check
            const flags = createDefaultFlags({ flightRecorder: true });
            let repoRootCallCount = 0;
            const deps = createMockDeps({
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    if (p === "/project") {
                        repoRootCallCount++;
                        if (repoRootCallCount > 1) {
                            throw Object.assign(new Error("EACCES"), {
                                code: "EACCES",
                            });
                        }
                    }
                    return p;
                }),
            });

            // Act & Assert
            await expect(handleInit(flags, deps)).rejects.toThrow("EACCES");
        });
    });
});

describe("ensureAgentShellAllowed", () => {
    it("should return unchanged when both entries already present", () => {
        const content = JSON.stringify({
            allow: [
                "agent-shell policy-check",
                "agent-shell record",
                "npm test",
            ],
            deny: ["rm -rf *"],
        });
        const result = ensureAgentShellAllowed(content);
        expect(result.status).toBe("unchanged");
    });

    it("should return patched with missing agent-shell record entry", () => {
        const content = JSON.stringify({
            allow: ["agent-shell policy-check", "npm test"],
            deny: ["rm -rf *"],
        });
        const result = ensureAgentShellAllowed(content);
        expect(result.status).toBe("patched");
        if (result.status !== "patched") return;
        const parsed = JSON.parse(result.content);
        expect(parsed.allow).toContain("agent-shell record");
        expect(parsed.allow).toContain("agent-shell policy-check");
        expect(parsed.allow).toContain("npm test");
        expect(parsed.deny).toEqual(["rm -rf *"]);
    });

    it("should return patched with both entries when allow list has neither", () => {
        const content = JSON.stringify({
            allow: ["npm test"],
            deny: ["rm -rf *"],
        });
        const result = ensureAgentShellAllowed(content);
        expect(result.status).toBe("patched");
        if (result.status !== "patched") return;
        const parsed = JSON.parse(result.content);
        expect(parsed.allow).toContain("agent-shell policy-check");
        expect(parsed.allow).toContain("agent-shell record");
    });

    it("should return invalid for corrupted JSON", () => {
        const result = ensureAgentShellAllowed("{broken");
        expect(result.status).toBe("invalid");
        if (result.status === "invalid") {
            expect(result.reason).toContain("JSON parse error");
        }
    });

    it("should return invalid for non-object JSON", () => {
        expect(ensureAgentShellAllowed('"just a string"').status).toBe(
            "invalid",
        );
        expect(ensureAgentShellAllowed("[]").status).toBe("invalid");
    });

    it("should return invalid for schema-violating content", () => {
        // Has extra fields that strict() rejects
        const content = JSON.stringify({
            allow: ["npm test"],
            deny: ["rm -rf *"],
            unknownField: true,
        });
        const result = ensureAgentShellAllowed(content);
        expect(result.status).toBe("invalid");
        if (result.status === "invalid") {
            expect(result.reason).toContain("schema validation failed");
        }
    });

    it("should return patched when allow field is missing", () => {
        const content = JSON.stringify({ deny: ["rm -rf *"] });
        const result = ensureAgentShellAllowed(content);
        expect(result.status).toBe("patched");
        if (result.status !== "patched") return;
        const parsed = JSON.parse(result.content);
        expect(parsed.allow).toContain("agent-shell policy-check");
        expect(parsed.allow).toContain("agent-shell record");
        expect(parsed.deny).toEqual(["rm -rf *"]);
    });

    it("should return invalid for __proto__ prototype pollution attempt", () => {
        const content = '{"__proto__":{"polluted":true},"allow":[]}';
        const result = ensureAgentShellAllowed(content);
        expect(result.status).toBe("invalid");
        if (result.status === "invalid") {
            expect(result.reason).toContain("schema validation failed");
        }
    });
});
