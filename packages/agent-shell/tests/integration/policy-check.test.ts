// biome-ignore-all lint/style/useNamingConvention: hook contract uses camelCase field names
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { PolicyDeps } from "../../src/policy.js";
import {
    handlePolicyCheck,
    type PolicyCheckDeps,
} from "../../src/policy-check.js";
import type { TelemetryDeps } from "../../src/telemetry.js";

const chance = new Chance();

function createMockTelemetryDeps(
    overrides?: Partial<TelemetryDeps>,
): TelemetryDeps {
    return {
        mkdir: vi.fn().mockResolvedValue(undefined),
        appendFile: vi.fn().mockResolvedValue(undefined),
        realpath: vi.fn().mockImplementation(async (p: string) => p),
        cwd: vi.fn().mockReturnValue("/project"),
        randomUUID: vi.fn().mockReturnValue(chance.guid()),
        writeStderr: vi.fn(),
        now: vi.fn().mockReturnValue("2026-01-01T00:00:00.000Z"),
        ...overrides,
    };
}

function createMockPolicyDeps(
    policyJson: string | null,
    repoRoot = "/repo",
): PolicyDeps {
    return {
        realpath: vi.fn().mockImplementation(async (p: string) => {
            if (p === repoRoot) return repoRoot;
            if (policyJson === null) {
                const err = new Error("ENOENT") as Error & { code: string };
                err.code = "ENOENT";
                throw err;
            }
            return p;
        }),
        readFile: vi.fn().mockImplementation(async () => {
            if (policyJson === null) {
                const err = new Error("ENOENT") as Error & { code: string };
                err.code = "ENOENT";
                throw err;
            }
            return policyJson;
        }),
        getRepositoryRoot: vi.fn().mockReturnValue(repoRoot),
    };
}

function createStdinJson(toolName: unknown, toolArgs: unknown): string {
    return JSON.stringify({
        timestamp: Date.now(),
        cwd: "/path",
        toolName,
        toolArgs,
    });
}

function createDeps(overrides?: Partial<PolicyCheckDeps>): PolicyCheckDeps & {
    stdout: string[];
    stderr: string[];
} {
    const stdout: string[] = [];
    const stderr: string[] = [];

    return {
        readStdin: vi.fn().mockResolvedValue("{}"),
        writeStdout: vi.fn().mockImplementation((data: string) => {
            stdout.push(data);
        }),
        writeStderr: vi.fn().mockImplementation((data: string) => {
            stderr.push(data);
        }),
        env: {},
        policyDeps: createMockPolicyDeps(null),
        telemetryDeps: createMockTelemetryDeps(),
        stdout,
        stderr,
        ...overrides,
    };
}

describe("policy-check mode", () => {
    describe("given a terminal tool with an allowed command", () => {
        it("should write an allow response to stdout", async () => {
            // Arrange
            const command = `npm run ${chance.word()}`;
            const stdinJson = createStdinJson(
                "bash",
                JSON.stringify({ command }),
            );
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
                policyDeps: createMockPolicyDeps(null),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response).toEqual({ permissionDecision: "allow" });
        });
    });

    describe("given a terminal tool with a denied command", () => {
        it("should write a deny response with reason to stdout", async () => {
            // Arrange
            const command = "rm -rf /";
            const policy = JSON.stringify({ deny: ["rm *"] });
            const stdinJson = createStdinJson(
                "bash",
                JSON.stringify({ command }),
            );
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
                policyDeps: createMockPolicyDeps(policy),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(response.permissionDecisionReason).toContain("rm -rf /");
            expect(response.permissionDecisionReason).toContain("rm *");
        });
    });

    describe("given a non-terminal tool", () => {
        it("should write an allow response without evaluating policy", async () => {
            // Arrange
            const toolName = chance.word();
            const stdinJson = createStdinJson(
                toolName,
                JSON.stringify({ path: "/some/file" }),
            );
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response).toEqual({ permissionDecision: "allow" });
        });

        it("should emit a telemetry event for non-terminal tool decisions", async () => {
            // Arrange
            const toolName = chance.word();
            const stdinJson = createStdinJson(
                toolName,
                JSON.stringify({ path: "/some/file" }),
            );
            const telemetryDeps = createMockTelemetryDeps();
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
                telemetryDeps,
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            expect(telemetryDeps.appendFile).toHaveBeenCalledOnce();
            const [, data] = vi.mocked(telemetryDeps.appendFile).mock.calls[0];
            const event = JSON.parse(data as string);
            expect(event.event).toBe("policy_decision");
            expect(event.decision).toBe("allow");
            expect(event.command).toBe(toolName);
        });
    });

    describe("given each recognized terminal tool name", () => {
        for (const shell of ["bash", "zsh", "ash", "sh"]) {
            it(`should evaluate policy for toolName '${shell}'`, async () => {
                // Arrange
                const command = "echo hello";
                const policy = JSON.stringify({ deny: ["echo *"] });
                const stdinJson = createStdinJson(
                    shell,
                    JSON.stringify({ command }),
                );
                const deps = createDeps({
                    readStdin: vi.fn().mockResolvedValue(stdinJson),
                    policyDeps: createMockPolicyDeps(policy),
                });

                // Act
                await handlePolicyCheck(deps);

                // Assert
                const response = JSON.parse(deps.stdout[0]);
                expect(response.permissionDecision).toBe("deny");
            });
        }
    });

    describe("given missing toolName field", () => {
        it("should write a deny response with descriptive error", async () => {
            // Arrange
            const stdinJson = JSON.stringify({
                timestamp: Date.now(),
                cwd: "/path",
            });
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(response.permissionDecisionReason).toContain("toolName");
        });
    });

    describe("given toolName is not a string", () => {
        it("should write a deny response with descriptive error", async () => {
            // Arrange
            const stdinJson = createStdinJson(42, "{}");
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(response.permissionDecisionReason).toContain("toolName");
        });
    });

    describe("given a terminal tool with missing toolArgs", () => {
        it("should write a deny response with descriptive error", async () => {
            // Arrange
            const stdinJson = JSON.stringify({
                timestamp: Date.now(),
                cwd: "/path",
                toolName: "bash",
            });
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(response.permissionDecisionReason).toContain("toolArgs");
        });
    });

    describe("given a terminal tool with non-string toolArgs", () => {
        it("should write a deny response with descriptive error", async () => {
            // Arrange
            const stdinJson = createStdinJson("bash", { command: "echo test" });
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert — Zod rejects non-string toolArgs at schema level
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(response.permissionDecisionReason).toBeDefined();
        });
    });

    describe("given a terminal tool with toolArgs missing command field", () => {
        it("should write a deny response with descriptive error", async () => {
            // Arrange
            const stdinJson = createStdinJson(
                "bash",
                JSON.stringify({ path: "/file" }),
            );
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(response.permissionDecisionReason).toContain("command");
        });
    });

    describe("given a terminal tool with non-string command", () => {
        it("should write a deny response with descriptive error", async () => {
            // Arrange
            const stdinJson = createStdinJson(
                "bash",
                JSON.stringify({ command: 123 }),
            );
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(response.permissionDecisionReason).toContain("command");
        });
    });

    describe("given invalid stdin JSON", () => {
        it("should write a deny response and error to stderr", async () => {
            // Arrange
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue("not valid json {{"),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(response.permissionDecisionReason).toBeDefined();
            expect(deps.stderr.length).toBeGreaterThan(0);
        });
    });

    describe("given an invalid policy file", () => {
        it("should write a deny response and error to stderr", async () => {
            // Arrange
            const command = "echo test";
            const stdinJson = createStdinJson(
                "bash",
                JSON.stringify({ command }),
            );
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
                policyDeps: createMockPolicyDeps("not valid json {{"),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(deps.stderr.length).toBeGreaterThan(0);
        });
    });

    describe("given no policy file exists", () => {
        it("should write an allow response", async () => {
            // Arrange
            const command = chance.sentence();
            const stdinJson = createStdinJson(
                "bash",
                JSON.stringify({ command }),
            );
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
                policyDeps: createMockPolicyDeps(null),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response).toEqual({ permissionDecision: "allow" });
        });
    });

    describe("given telemetry emission fails", () => {
        it("should still write the decision and log error to stderr", async () => {
            // Arrange
            const command = chance.sentence();
            const stdinJson = createStdinJson(
                "bash",
                JSON.stringify({ command }),
            );
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
                policyDeps: createMockPolicyDeps(null),
                telemetryDeps: createMockTelemetryDeps({
                    mkdir: vi.fn().mockRejectedValue(new Error("EACCES")),
                }),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response).toEqual({ permissionDecision: "allow" });
            expect(deps.stderr.some((s) => s.includes("telemetry"))).toBe(true);
        });
    });

    describe("given getRepositoryRoot throws during telemetry", () => {
        it("should still write the decision and log error to stderr", async () => {
            // Arrange
            const command = chance.sentence();
            const stdinJson = createStdinJson(
                "bash",
                JSON.stringify({ command }),
            );
            const policyDeps = createMockPolicyDeps(null);
            // Succeed for loadPolicy, then throw for telemetry
            policyDeps.getRepositoryRoot = vi
                .fn()
                .mockReturnValueOnce("/repo")
                .mockImplementation(() => {
                    throw new Error("not a git repo");
                });
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
                policyDeps,
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response).toEqual({ permissionDecision: "allow" });
            expect(deps.stderr.some((s) => s.includes("telemetry"))).toBe(true);
        });
    });

    describe("given an unexpected runtime error", () => {
        it("should write a deny response with generic error and log to stderr", async () => {
            // Arrange
            const deps = createDeps({
                readStdin: vi.fn().mockRejectedValue(new Error("stdin broken")),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(response.permissionDecisionReason).toBeDefined();
            expect(deps.stderr.length).toBeGreaterThan(0);
        });
    });

    describe("given the response contains special characters in command", () => {
        it("should safely serialize using JSON.stringify", async () => {
            // Arrange
            const command = 'rm -rf "hello\nworld"';
            const policy = JSON.stringify({ deny: ["rm *"] });
            const stdinJson = createStdinJson(
                "bash",
                JSON.stringify({ command }),
            );
            const deps = createDeps({
                readStdin: vi.fn().mockResolvedValue(stdinJson),
                policyDeps: createMockPolicyDeps(policy),
            });

            // Act
            await handlePolicyCheck(deps);

            // Assert — output must be valid JSON (JSON.stringify handles escaping)
            const response = JSON.parse(deps.stdout[0]);
            expect(response.permissionDecision).toBe("deny");
            expect(typeof response.permissionDecisionReason).toBe("string");
        });
    });
});
