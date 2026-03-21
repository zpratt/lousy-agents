// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { ShimResult } from "../src/shim.js";
import type { TelemetryDeps } from "../src/telemetry.js";
import {
    emitPolicyDecisionEvent,
    emitScriptEndEvent,
    emitShimErrorEvent,
    resolveSessionId,
    resolveWriteEventsDir,
} from "../src/telemetry.js";
import {
    PolicyDecisionEventSchema,
    ScriptEndEventSchema,
    ShimErrorEventSchema,
} from "../src/types.js";

const chance = new Chance();

function createMockDeps(
    overrides?: Partial<TelemetryDeps>,
): TelemetryDeps & { written: string[] } {
    const written: string[] = [];
    return {
        mkdir: vi.fn().mockResolvedValue(undefined),
        appendFile: vi
            .fn()
            .mockImplementation(async (_path: string, data: string) => {
                written.push(data);
            }),
        realpath: vi.fn().mockImplementation(async (p: string) => p),
        cwd: vi.fn().mockReturnValue("/project"),
        randomUUID: vi.fn().mockReturnValue("generated-uuid"),
        writeStderr: vi.fn(),
        now: vi.fn().mockReturnValue("2026-01-01T00:00:00.000Z"),
        written,
        ...overrides,
    };
}

function createShimResult(overrides?: Partial<ShimResult>): ShimResult {
    return {
        exitCode: chance.integer({ min: 0, max: 255 }),
        signal: null,
        durationMs: chance.floating({ min: 0.1, max: 5000 }),
        ...overrides,
    };
}

describe("session ID resolution", () => {
    describe("given a valid UUID in AGENTSHELL_SESSION_ID", () => {
        it("should use the provided session ID", () => {
            // Arrange
            const sessionId = chance.guid();
            const env = { AGENTSHELL_SESSION_ID: sessionId };
            const deps = createMockDeps();

            // Act
            const result = resolveSessionId(env, deps);

            // Assert
            expect(result).toBe(sessionId);
        });
    });

    describe("given a valid alphanumeric-with-hyphens AGENTSHELL_SESSION_ID", () => {
        it("should use the provided session ID", () => {
            // Arrange
            const sessionId = "my-session_123";
            const env = { AGENTSHELL_SESSION_ID: sessionId };
            const deps = createMockDeps();

            // Act
            const result = resolveSessionId(env, deps);

            // Assert
            expect(result).toBe(sessionId);
        });
    });

    describe("given AGENTSHELL_SESSION_ID containing path traversal", () => {
        it("should reject it and generate a UUID", () => {
            // Arrange
            const env = { AGENTSHELL_SESSION_ID: "../escape" };
            const deps = createMockDeps();

            // Act
            const result = resolveSessionId(env, deps);

            // Assert
            expect(result).toBe("generated-uuid");
            expect(deps.writeStderr).toHaveBeenCalledOnce();
        });
    });

    describe("given AGENTSHELL_SESSION_ID containing forward slash", () => {
        it("should reject it and generate a UUID", () => {
            // Arrange
            const env = { AGENTSHELL_SESSION_ID: "some/path" };
            const deps = createMockDeps();

            // Act
            const result = resolveSessionId(env, deps);

            // Assert
            expect(result).toBe("generated-uuid");
            expect(deps.writeStderr).toHaveBeenCalledOnce();
        });
    });

    describe("given AGENTSHELL_SESSION_ID containing backslash", () => {
        it("should reject it and generate a UUID", () => {
            // Arrange
            const env = { AGENTSHELL_SESSION_ID: "some\\path" };
            const deps = createMockDeps();

            // Act
            const result = resolveSessionId(env, deps);

            // Assert
            expect(result).toBe("generated-uuid");
            expect(deps.writeStderr).toHaveBeenCalledOnce();
        });
    });

    describe("given AGENTSHELL_SESSION_ID with special characters", () => {
        it("should reject it and generate a UUID", () => {
            // Arrange
            const env = { AGENTSHELL_SESSION_ID: "session@#$!" };
            const deps = createMockDeps();

            // Act
            const result = resolveSessionId(env, deps);

            // Assert
            expect(result).toBe("generated-uuid");
            expect(deps.writeStderr).toHaveBeenCalledOnce();
        });
    });

    describe("given AGENTSHELL_SESSION_ID is not set", () => {
        it("should generate a UUID", () => {
            // Arrange
            const env = {};
            const deps = createMockDeps();

            // Act
            const result = resolveSessionId(env, deps);

            // Assert
            expect(result).toBe("generated-uuid");
            expect(deps.writeStderr).not.toHaveBeenCalled();
        });
    });
});

describe("events directory resolution", () => {
    describe("given a valid AGENTSHELL_LOG_DIR within the project root", () => {
        it("should use the provided directory", async () => {
            // Arrange
            const env = { AGENTSHELL_LOG_DIR: "/project/custom-logs" };
            const deps = createMockDeps({
                realpath: vi.fn().mockResolvedValue("/project/custom-logs"),
            });

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert
            expect(result).toBe("/project/custom-logs");
        });
    });

    describe("given a relative AGENTSHELL_LOG_DIR", () => {
        it("should resolve it relative to projectRoot (deps.cwd), not process.cwd", async () => {
            // Arrange
            const relativeDir = "custom-logs";
            const env = { AGENTSHELL_LOG_DIR: relativeDir };
            const expectedResolved = "/project/custom-logs";
            const deps = createMockDeps({
                realpath: vi.fn().mockResolvedValue(expectedResolved),
            });

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert — mkdir and realpath receive the resolved path, not the raw relative value
            expect(deps.mkdir).toHaveBeenCalledWith(expectedResolved, {
                recursive: true,
            });
            expect(deps.realpath).toHaveBeenCalledWith(expectedResolved);
            expect(result).toBe(expectedResolved);
        });
    });

    describe("given AGENTSHELL_LOG_DIR with path traversal", () => {
        it("should fall back to default and write diagnostic to stderr", async () => {
            // Arrange
            const env = { AGENTSHELL_LOG_DIR: "/project/../escape" };
            const deps = createMockDeps();

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert
            expect(result).toBe("/project/.agent-shell/events");
            expect(deps.writeStderr).toHaveBeenCalledOnce();
        });
    });

    describe("given AGENTSHELL_LOG_DIR with a dot-prefixed name that is not traversal", () => {
        it("should accept the directory and not fall back to default", async () => {
            // Arrange — "..foo" starts with ".." but is a valid directory name, not traversal
            const env = { AGENTSHELL_LOG_DIR: "..foo" };
            const deps = createMockDeps();

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert — should resolve to /project/..foo, not fall back to default
            expect(result).toBe("/project/..foo");
            expect(deps.writeStderr).not.toHaveBeenCalled();
        });
    });

    describe("given AGENTSHELL_LOG_DIR with an absolute path outside project root", () => {
        it("should fall back to default without creating the external directory", async () => {
            // Arrange
            const env = { AGENTSHELL_LOG_DIR: "/tmp/evil" };
            const deps = createMockDeps();

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert
            expect(result).toBe("/project/.agent-shell/events");
            expect(deps.mkdir).not.toHaveBeenCalledWith(
                "/tmp/evil",
                expect.anything(),
            );
            expect(deps.writeStderr).toHaveBeenCalledOnce();
        });
    });

    describe("given a project root that is itself a symlink", () => {
        it("should not produce a false-negative fallback for a valid log dir within the real root", async () => {
            // Arrange: cwd() returns a logical symlink path (/symlink-project → /real-project)
            const env = { AGENTSHELL_LOG_DIR: "logs" };
            const deps = createMockDeps({
                cwd: vi.fn().mockReturnValue("/symlink-project"),
                realpath: vi
                    .fn()
                    .mockImplementation(async (p: string) =>
                        p.replace("/symlink-project", "/real-project"),
                    ),
            });

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert: resolves within the real project root — no false-negative fallback
            expect(result).toBe("/real-project/logs");
            expect(deps.writeStderr).not.toHaveBeenCalled();
        });
    });

    describe("given AGENTSHELL_LOG_DIR that resolves outside project root via symlink", () => {
        it("should fall back to default and write diagnostic to stderr", async () => {
            // Arrange
            const env = { AGENTSHELL_LOG_DIR: "/project/sneaky-link" };
            const deps = createMockDeps({
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    if (p === "/project") return "/project";
                    return "/elsewhere/logs";
                }),
            });

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert
            expect(result).toBe("/project/.agent-shell/events");
            expect(deps.writeStderr).toHaveBeenCalled();
        });
    });

    describe("given AGENTSHELL_LOG_DIR with a symlinked ancestor escaping the project", () => {
        it("should not create directories under the symlink", async () => {
            // Arrange
            const env = { AGENTSHELL_LOG_DIR: "sneaky-link/logs" };
            const realpathMock = vi
                .fn()
                .mockImplementation(async (p: string) => {
                    if (p === "/project/sneaky-link/logs")
                        throw Object.assign(new Error("ENOENT"), {
                            code: "ENOENT",
                        });
                    if (p === "/project/sneaky-link") return "/elsewhere";
                    return p;
                });
            const deps = createMockDeps({ realpath: realpathMock });

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert
            expect(result).toBe("/project/.agent-shell/events");
            expect(deps.mkdir).not.toHaveBeenCalledWith(
                "/project/sneaky-link/logs",
                expect.anything(),
            );
        });
    });

    describe("given ancestor realpath fails with a non-ENOENT error", () => {
        it("should propagate the error instead of silently falling back", async () => {
            // Arrange
            const env = { AGENTSHELL_LOG_DIR: "restricted-dir/logs" };
            const realpathMock = vi
                .fn()
                .mockImplementation(async (p: string) => {
                    if (p === "/project/restricted-dir/logs")
                        throw Object.assign(new Error("EACCES"), {
                            code: "EACCES",
                        });
                    return p;
                });
            const deps = createMockDeps({ realpath: realpathMock });

            // Act & Assert
            await expect(resolveWriteEventsDir(env, deps)).rejects.toThrow(
                "EACCES",
            );
        });
    });

    describe("given a log dir nested more than 50 levels deep with no intermediate dirs existing", () => {
        it("should resolve to the deep path without falling back to default", async () => {
            // Arrange: 55 levels deep — exceeds the old hard cap of 50
            const depth = 55;
            const segments = Array.from({ length: depth }, (_, i) => `d${i}`);
            const logDir = segments.join("/");
            const env = { AGENTSHELL_LOG_DIR: logDir };

            const created: string[] = [];
            const deps = createMockDeps({
                mkdir: vi.fn().mockImplementation(async (p: string) => {
                    created.push(p);
                }),
                realpath: vi.fn().mockImplementation(async (p: string) => {
                    // /project always exists; deep path exists after mkdir
                    if (p === "/project") return "/project";
                    if (created.includes(p)) return p;
                    throw Object.assign(new Error("ENOENT"), {
                        code: "ENOENT",
                    });
                }),
            });

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert: resolved to the deep path, not the default fallback
            const expected = `/project/${logDir}`;
            expect(result).toBe(expected);
            expect(deps.mkdir).toHaveBeenCalledWith(expected, {
                recursive: true,
            });
        });
    });

    describe("given AGENTSHELL_LOG_DIR is not set", () => {
        it("should use the default .agent-shell/events/ directory", async () => {
            // Arrange
            const env = {};
            const deps = createMockDeps();

            // Act
            const result = await resolveWriteEventsDir(env, deps);

            // Assert
            expect(result).toBe("/project/.agent-shell/events");
        });
    });

    describe("given the events directory does not exist", () => {
        it("should create it recursively", async () => {
            // Arrange
            const env = {};
            const deps = createMockDeps();

            // Act
            await resolveWriteEventsDir(env, deps);

            // Assert
            expect(deps.mkdir).toHaveBeenCalledWith(
                "/project/.agent-shell/events",
                { recursive: true },
            );
        });
    });
});

describe("event writing", () => {
    describe("given a successful script execution", () => {
        it("should write a valid JSONL line to the correct file path", async () => {
            // Arrange
            const command = chance.sentence();
            const shimResult = createShimResult({ exitCode: 0 });
            const deps = createMockDeps();
            const env = {};

            // Act
            await emitScriptEndEvent(
                { command, result: shimResult, env },
                deps,
            );

            // Assert
            expect(deps.appendFile).toHaveBeenCalledOnce();
            const [filePath, data] = vi.mocked(deps.appendFile).mock.calls[0];
            expect(filePath).toBe(
                "/project/.agent-shell/events/generated-uuid.jsonl",
            );
            expect(data).toMatch(/\n$/);
            const parsed = JSON.parse(data);
            expect(parsed.event).toBe("script_end");
        });
    });

    describe("given a script_end event", () => {
        it("should contain all required fields", async () => {
            // Arrange
            const command = chance.sentence();
            const shimResult = createShimResult();
            const deps = createMockDeps();
            const env = {};

            // Act
            await emitScriptEndEvent(
                { command, result: shimResult, env },
                deps,
            );

            // Assert
            const parsed = JSON.parse(deps.written[0]);
            const validated = ScriptEndEventSchema.parse(parsed);
            expect(validated.v).toBe(1);
            expect(validated.session_id).toBe("generated-uuid");
            expect(validated.event).toBe("script_end");
            expect(validated.command).toBe(command);
            expect(validated.actor).toBe("human");
            expect(validated.exit_code).toBe(shimResult.exitCode);
            expect(validated.signal).toBe(shimResult.signal);
            expect(validated.duration_ms).toBe(shimResult.durationMs);
            expect(validated.timestamp).toBe("2026-01-01T00:00:00.000Z");
            expect(validated.env).toBeDefined();
            expect(validated.tags).toBeDefined();
        });
    });

    describe("given npm lifecycle variables are present in the environment", () => {
        it("should include npm fields in the event", async () => {
            // Arrange
            const command = chance.sentence();
            const shimResult = createShimResult();
            const deps = createMockDeps();
            const lifecycleEvent = chance.word();
            const packageName = chance.word();
            const packageVersion = chance.semver();
            const env = {
                npm_lifecycle_event: lifecycleEvent,
                npm_package_name: packageName,
                npm_package_version: packageVersion,
            };

            // Act
            await emitScriptEndEvent(
                { command, result: shimResult, env },
                deps,
            );

            // Assert
            const parsed = JSON.parse(deps.written[0]);
            expect(parsed.script).toBe(lifecycleEvent);
            expect(parsed.package).toBe(packageName);
            expect(parsed.package_version).toBe(packageVersion);
        });
    });

    describe("given npm lifecycle variables are absent from the environment", () => {
        it("should omit npm fields from the event", async () => {
            // Arrange
            const command = chance.sentence();
            const shimResult = createShimResult();
            const deps = createMockDeps();
            const env = {};

            // Act
            await emitScriptEndEvent(
                { command, result: shimResult, env },
                deps,
            );

            // Assert
            const parsed = JSON.parse(deps.written[0]);
            expect(parsed).not.toHaveProperty("script");
            expect(parsed).not.toHaveProperty("package");
            expect(parsed).not.toHaveProperty("package_version");
        });
    });

    describe("given a shim error", () => {
        it("should emit a valid shim_error event", async () => {
            // Arrange
            const command = chance.sentence();
            const error = new Error(chance.sentence());
            const deps = createMockDeps();
            const env = {};

            // Act
            await emitShimErrorEvent({ command, env, error }, deps);

            // Assert
            const parsed = JSON.parse(deps.written[0]);
            const validated = ShimErrorEventSchema.parse(parsed);
            expect(validated.event).toBe("shim_error");
            expect(validated.command).toBe(command);
            expect(validated.session_id).toBe("generated-uuid");
            expect(validated.timestamp).toBe("2026-01-01T00:00:00.000Z");
        });
    });

    describe("given a custom now function", () => {
        it("should use the injected timestamp in emitted events", async () => {
            // Arrange
            const command = chance.sentence();
            const shimResult = createShimResult();
            const fixedTimestamp = "2030-06-15T12:00:00.000Z";
            const deps = createMockDeps({
                now: vi.fn().mockReturnValue(fixedTimestamp),
            });
            const env = {};

            // Act
            await emitScriptEndEvent(
                { command, result: shimResult, env },
                deps,
            );

            // Assert
            const parsed = JSON.parse(deps.written[0]);
            expect(parsed.timestamp).toBe(fixedTimestamp);
        });
    });
});

describe("graceful degradation", () => {
    describe("given telemetry mkdir fails", () => {
        it("should propagate the error to the caller", async () => {
            // Arrange
            const command = chance.sentence();
            const shimResult = createShimResult();
            const deps = createMockDeps({
                mkdir: vi.fn().mockRejectedValue(new Error("EACCES")),
            });
            const env = {};

            // Act & Assert
            await expect(
                emitScriptEndEvent({ command, result: shimResult, env }, deps),
            ).rejects.toThrow("EACCES");
        });
    });

    describe("given telemetry write fails", () => {
        it("should propagate the error to the caller", async () => {
            // Arrange
            const command = chance.sentence();
            const shimResult = createShimResult();
            const deps = createMockDeps({
                appendFile: vi.fn().mockRejectedValue(new Error("ENOSPC")),
            });
            const env = {};

            // Act & Assert
            await expect(
                emitScriptEndEvent({ command, result: shimResult, env }, deps),
            ).rejects.toThrow("ENOSPC");
        });
    });

    describe("given a diagnostic is needed", () => {
        it("should write the diagnostic to stderr", () => {
            // Arrange
            const env = { AGENTSHELL_SESSION_ID: "../evil" };
            const deps = createMockDeps();

            // Act
            resolveSessionId(env, deps);

            // Assert
            expect(deps.writeStderr).toHaveBeenCalledWith(
                expect.stringContaining("agent-shell"),
            );
        });
    });
});

describe("policy decision event emission", () => {
    describe("given a deny decision with a matched rule", () => {
        it("should emit a valid policy_decision event", async () => {
            // Arrange
            const command = chance.sentence();
            const matchedRule = chance.word();
            const projectRoot = "/repo-root";
            const deps = createMockDeps();
            const env = {};

            // Act
            await emitPolicyDecisionEvent(
                {
                    command,
                    decision: "deny",
                    matched_rule: matchedRule,
                    env,
                    projectRoot,
                },
                deps,
            );

            // Assert
            const parsed = JSON.parse(deps.written[0]);
            const validated = PolicyDecisionEventSchema.parse(parsed);
            expect(validated.event).toBe("policy_decision");
            expect(validated.command).toBe(command);
            expect(validated.decision).toBe("deny");
            expect(validated.matched_rule).toBe(matchedRule);
            expect(validated.session_id).toBe("generated-uuid");
            expect(validated.timestamp).toBe("2026-01-01T00:00:00.000Z");
        });
    });

    describe("given an allow decision with no matched rule", () => {
        it("should emit a policy_decision event with null matched_rule", async () => {
            // Arrange
            const command = chance.sentence();
            const projectRoot = "/repo-root";
            const deps = createMockDeps();
            const env = {};

            // Act
            await emitPolicyDecisionEvent(
                {
                    command,
                    decision: "allow",
                    matched_rule: null,
                    env,
                    projectRoot,
                },
                deps,
            );

            // Assert
            const parsed = JSON.parse(deps.written[0]);
            expect(parsed.decision).toBe("allow");
            expect(parsed.matched_rule).toBeNull();
        });
    });

    describe("given a projectRoot parameter", () => {
        it("should use projectRoot instead of deps.cwd() for event directory resolution", async () => {
            // Arrange
            const command = chance.sentence();
            const projectRoot = "/custom-repo-root";
            const deps = createMockDeps({
                cwd: vi.fn().mockReturnValue("/different-cwd"),
            });
            const env = {};

            // Act
            await emitPolicyDecisionEvent(
                {
                    command,
                    decision: "allow",
                    matched_rule: null,
                    env,
                    projectRoot,
                },
                deps,
            );

            // Assert
            expect(deps.mkdir).toHaveBeenCalledWith(
                "/custom-repo-root/.agent-shell/events",
                { recursive: true },
            );
            const [filePath] = vi.mocked(deps.appendFile).mock.calls[0];
            expect(filePath).toBe(
                "/custom-repo-root/.agent-shell/events/generated-uuid.jsonl",
            );
        });
    });

    describe("given all base telemetry fields", () => {
        it("should include v, session_id, actor, env, and tags", async () => {
            // Arrange
            const command = chance.sentence();
            const projectRoot = "/repo-root";
            const deps = createMockDeps();
            const env = {};

            // Act
            await emitPolicyDecisionEvent(
                {
                    command,
                    decision: "allow",
                    matched_rule: null,
                    env,
                    projectRoot,
                },
                deps,
            );

            // Assert
            const parsed = JSON.parse(deps.written[0]);
            expect(parsed.v).toBe(1);
            expect(parsed.actor).toBe("human");
            expect(parsed.env).toBeDefined();
            expect(parsed.tags).toBeDefined();
        });
    });
});
