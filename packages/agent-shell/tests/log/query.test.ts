// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { QueryDeps } from "../../src/log/query.js";
import {
    listSessions,
    parseDuration,
    queryEvents,
    resolveReadEventsDir,
} from "../../src/log/query.js";

const chance = new Chance();

const MAX_LINE_BYTES = 65_536;
const MAX_LINES_PER_FILE = 100_000;

function buildScriptEndEvent(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        v: 1,
        session_id: chance.guid(),
        event: "script_end",
        command: chance.word(),
        actor: chance.word(),
        exit_code: chance.integer({ min: 0, max: 255 }),
        signal: null,
        duration_ms: chance.floating({ min: 0, max: 60000, fixed: 2 }),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

function buildShimErrorEvent(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        v: 1,
        session_id: chance.guid(),
        event: "shim_error",
        command: chance.word(),
        actor: chance.word(),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

interface MockFileData {
    lines: string[];
    mtimeMs?: number;
}

function createMockDeps(
    files: Record<string, MockFileData>,
    overrides?: Partial<QueryDeps>,
): QueryDeps {
    return {
        readdir: vi.fn().mockResolvedValue(Object.keys(files)),
        stat: vi.fn().mockImplementation(async (path: string) => {
            const basename = path.split("/").pop() ?? "";
            return { mtimeMs: files[basename]?.mtimeMs ?? Date.now() };
        }),
        realpath: vi.fn().mockImplementation(async (p: string) => p),
        cwd: vi.fn().mockReturnValue("/project"),
        readFileLines: vi.fn().mockImplementation((path: string) => {
            const basename = path.split("/").pop() ?? "";
            const fileData = files[basename];
            const lines = fileData?.lines ?? [];
            return (async function* () {
                for (const line of lines) {
                    yield line;
                }
            })();
        }),
        writeStderr: vi.fn(),
        ...overrides,
    };
}

describe("duration parsing", () => {
    it("should parse minutes to milliseconds", () => {
        // Arrange
        const duration = "30m";

        // Act
        const result = parseDuration(duration);

        // Assert
        expect(result).toBe(1_800_000);
    });

    it("should parse hours to milliseconds", () => {
        // Arrange
        const duration = "2h";

        // Act
        const result = parseDuration(duration);

        // Assert
        expect(result).toBe(7_200_000);
    });

    it("should parse days to milliseconds", () => {
        // Arrange
        const duration = "1d";

        // Act
        const result = parseDuration(duration);

        // Assert
        expect(result).toBe(86_400_000);
    });

    it("should reject zero duration", () => {
        // Arrange
        const duration = "0m";

        // Act & Assert
        expect(() => parseDuration(duration)).toThrow(
            /must be a positive value/,
        );
    });

    it("should reject negative values", () => {
        // Arrange
        const duration = "-1h";

        // Act & Assert
        expect(() => parseDuration(duration)).toThrow(
            /Invalid duration format/,
        );
    });

    it("should reject invalid format", () => {
        // Arrange
        const duration = "abc";

        // Act & Assert
        expect(() => parseDuration(duration)).toThrow(
            /Invalid duration format/,
        );
    });

    it("should reject missing unit", () => {
        // Arrange
        const duration = "30";

        // Act & Assert
        expect(() => parseDuration(duration)).toThrow(
            /Invalid duration format/,
        );
    });

    it("should reject non-numeric value with valid unit", () => {
        // Arrange
        const duration = "abc_m";

        // Act & Assert
        expect(() => parseDuration(duration)).toThrow(
            /Invalid duration format/,
        );
    });
});

describe("event querying", () => {
    describe("given no event files", () => {
        it("should return an empty events array", async () => {
            // Arrange
            const deps = createMockDeps({});

            // Act
            const result = await queryEvents("/events", {}, deps);

            // Assert
            expect(result.events).toEqual([]);
            expect(result.truncatedFiles).toEqual([]);
        });
    });

    describe("given valid event files", () => {
        it("should return events from the most recent session when no filters are set", async () => {
            // Arrange
            const recentActor = chance.word();
            const oldActor = chance.word();
            const recentEvent = buildScriptEndEvent({ actor: recentActor });
            const oldEvent = buildScriptEndEvent({ actor: oldActor });

            const deps = createMockDeps({
                "old-session.jsonl": {
                    lines: [JSON.stringify(oldEvent)],
                    mtimeMs: 1000,
                },
                "recent-session.jsonl": {
                    lines: [JSON.stringify(recentEvent)],
                    mtimeMs: 2000,
                },
            });

            // Act
            const result = await queryEvents("/events", {}, deps);

            // Assert
            expect(result.events).toHaveLength(1);
            expect(result.events[0].actor).toBe(recentActor);
        });

        it("should filter events by actor", async () => {
            // Arrange
            const targetActor = chance.word();
            const otherActor = chance.word();
            const matchingEvent = buildScriptEndEvent({ actor: targetActor });
            const nonMatchingEvent = buildScriptEndEvent({
                actor: otherActor,
            });

            const deps = createMockDeps({
                "session.jsonl": {
                    lines: [
                        JSON.stringify(matchingEvent),
                        JSON.stringify(nonMatchingEvent),
                    ],
                    mtimeMs: 1000,
                },
            });

            // Act
            const result = await queryEvents(
                "/events",
                { actor: targetActor },
                deps,
            );

            // Assert
            expect(result.events).toHaveLength(1);
            expect(result.events[0].actor).toBe(targetActor);
        });

        it("should filter events by script name", async () => {
            // Arrange
            const targetScript = chance.word();
            const otherScript = chance.word();
            const matchingEvent = buildScriptEndEvent({
                script: targetScript,
            });
            const nonMatchingEvent = buildScriptEndEvent({
                script: otherScript,
            });
            const shimEvent = buildShimErrorEvent();

            const deps = createMockDeps({
                "session.jsonl": {
                    lines: [
                        JSON.stringify(matchingEvent),
                        JSON.stringify(nonMatchingEvent),
                        JSON.stringify(shimEvent),
                    ],
                    mtimeMs: 1000,
                },
            });

            // Act
            const result = await queryEvents(
                "/events",
                { script: targetScript },
                deps,
            );

            // Assert
            expect(result.events).toHaveLength(1);
            expect(result.events[0].event).toBe("script_end");
        });

        it("should filter events by failures (non-zero exit code)", async () => {
            // Arrange
            const failedEvent = buildScriptEndEvent({ exit_code: 1 });
            const successEvent = buildScriptEndEvent({ exit_code: 0 });
            const shimEvent = buildShimErrorEvent();

            const deps = createMockDeps({
                "session.jsonl": {
                    lines: [
                        JSON.stringify(failedEvent),
                        JSON.stringify(successEvent),
                        JSON.stringify(shimEvent),
                    ],
                    mtimeMs: 1000,
                },
            });

            // Act
            const result = await queryEvents(
                "/events",
                { failures: true },
                deps,
            );

            // Assert
            expect(result.events).toHaveLength(1);
            expect(result.events[0].event).toBe("script_end");
            if (result.events[0].event === "script_end") {
                expect(result.events[0].exit_code).not.toBe(0);
            }
        });

        it("should read all files and filter by time window when last is set", async () => {
            // Arrange
            const recentTimestamp = new Date().toISOString();
            const oldTimestamp = new Date(
                Date.now() - 2 * 60 * 60 * 1000,
            ).toISOString();

            const recentEvent = buildScriptEndEvent({
                timestamp: recentTimestamp,
            });
            const oldEvent = buildScriptEndEvent({
                timestamp: oldTimestamp,
            });

            const deps = createMockDeps({
                "session1.jsonl": {
                    lines: [JSON.stringify(recentEvent)],
                    mtimeMs: 2000,
                },
                "session2.jsonl": {
                    lines: [JSON.stringify(oldEvent)],
                    mtimeMs: 1000,
                },
            });

            // Act
            const result = await queryEvents("/events", { last: "1h" }, deps);

            // Assert
            expect(result.events).toHaveLength(1);
            expect(result.events[0].timestamp).toBe(recentTimestamp);
        });

        it("should combine multiple filters with AND logic", async () => {
            // Arrange
            const targetActor = chance.word();
            const targetScript = chance.word();

            const matchingEvent = buildScriptEndEvent({
                actor: targetActor,
                exit_code: 1,
                script: targetScript,
            });
            const wrongActorEvent = buildScriptEndEvent({
                actor: chance.word(),
                exit_code: 1,
                script: targetScript,
            });
            const successEvent = buildScriptEndEvent({
                actor: targetActor,
                exit_code: 0,
                script: targetScript,
            });

            const deps = createMockDeps({
                "session.jsonl": {
                    lines: [
                        JSON.stringify(matchingEvent),
                        JSON.stringify(wrongActorEvent),
                        JSON.stringify(successEvent),
                    ],
                    mtimeMs: 1000,
                },
            });

            // Act
            const result = await queryEvents(
                "/events",
                {
                    actor: targetActor,
                    failures: true,
                    script: targetScript,
                },
                deps,
            );

            // Assert
            expect(result.events).toHaveLength(1);
            expect(result.events[0].actor).toBe(targetActor);
        });
    });

    describe("given malformed event files", () => {
        it("should skip malformed JSONL lines", async () => {
            // Arrange
            const validEvent = buildScriptEndEvent();
            const deps = createMockDeps({
                "session.jsonl": {
                    lines: [
                        "not valid json",
                        JSON.stringify(validEvent),
                        "{incomplete",
                    ],
                    mtimeMs: 1000,
                },
            });

            // Act
            const result = await queryEvents("/events", {}, deps);

            // Assert
            expect(result.events).toHaveLength(1);
        });

        it("should skip lines exceeding 64KB", async () => {
            // Arrange
            const validEvent = buildScriptEndEvent();
            const oversizedLine = "x".repeat(MAX_LINE_BYTES + 1);
            const deps = createMockDeps({
                "session.jsonl": {
                    lines: [oversizedLine, JSON.stringify(validEvent)],
                    mtimeMs: 1000,
                },
            });

            // Act
            const result = await queryEvents("/events", {}, deps);

            // Assert
            expect(result.events).toHaveLength(1);
        });

        it("should stop reading a file at 100,000 lines and warn", async () => {
            // Arrange
            const validEvent = buildScriptEndEvent();
            const eventLine = JSON.stringify(validEvent);

            const deps: QueryDeps = {
                readdir: vi.fn().mockResolvedValue(["huge-session.jsonl"]),
                stat: vi.fn().mockResolvedValue({ mtimeMs: 1000 }),
                realpath: vi.fn().mockImplementation(async (p: string) => p),
                cwd: vi.fn().mockReturnValue("/project"),
                readFileLines: vi.fn().mockImplementation(() =>
                    (async function* () {
                        // First line is valid, rest are cheap invalid lines
                        yield eventLine;
                        for (let i = 1; i <= MAX_LINES_PER_FILE; i++) {
                            yield "{}";
                        }
                    })(),
                ),
                writeStderr: vi.fn(),
            };

            // Act
            const result = await queryEvents("/events", {}, deps);

            // Assert
            expect(result.events).toHaveLength(1);
            expect(result.truncatedFiles).toContain("huge-session.jsonl");
            expect(deps.writeStderr).toHaveBeenCalledOnce();
        }, 30_000);
    });
});

describe("events directory resolution", () => {
    describe("given AGENTSHELL_LOG_DIR within project root", () => {
        it("should read from the custom directory", async () => {
            // Arrange
            const deps = createMockDeps({});
            const env = { AGENTSHELL_LOG_DIR: "/project/custom-logs" };

            // Act
            const result = await resolveReadEventsDir(env, deps);

            // Assert
            expect(result.dir).toBe("/project/custom-logs");
            expect(result.error).toBeUndefined();
        });
    });

    describe("given AGENTSHELL_LOG_DIR outside project root", () => {
        it("should return an error", async () => {
            // Arrange
            const deps = createMockDeps(
                {},
                {
                    realpath: vi.fn().mockImplementation(async (p: string) => {
                        if (p === "/project") return "/project";
                        return "/elsewhere/logs";
                    }),
                },
            );
            const env = { AGENTSHELL_LOG_DIR: "/project/sneaky-link" };

            // Act
            const result = await resolveReadEventsDir(env, deps);

            // Assert
            expect(result.error).toBeDefined();
            expect(result.error).toContain("outside project root");
        });
    });

    describe("given a symlinked project root", () => {
        it("should accept directories within the real project root", async () => {
            // Arrange — cwd returns /workspace (symlink), realpath resolves to /mnt/project
            const deps = createMockDeps(
                {},
                {
                    cwd: vi.fn().mockReturnValue("/workspace"),
                    realpath: vi.fn().mockImplementation(async (p: string) => {
                        if (p === "/workspace") return "/mnt/project";
                        if (p === "/workspace/custom-logs")
                            return "/mnt/project/custom-logs";
                        return p;
                    }),
                },
            );
            const env = { AGENTSHELL_LOG_DIR: "custom-logs" };

            // Act
            const result = await resolveReadEventsDir(env, deps);

            // Assert
            expect(result.dir).toBe("/mnt/project/custom-logs");
            expect(result.error).toBeUndefined();
        });
    });

    describe("given AGENTSHELL_LOG_DIR is not set", () => {
        it("should use the default events directory", async () => {
            // Arrange
            const deps = createMockDeps({});
            const env = {};

            // Act
            const result = await resolveReadEventsDir(env, deps);

            // Assert
            expect(result.dir).toBe("/project/.agent-shell/events");
            expect(result.error).toBeUndefined();
        });
    });

    describe("given AGENTSHELL_LOG_DIR is an empty string", () => {
        it("should use the default events directory", async () => {
            // Arrange
            const deps = createMockDeps({});
            const env = { AGENTSHELL_LOG_DIR: "" };

            // Act
            const result = await resolveReadEventsDir(env, deps);

            // Assert
            expect(result.dir).toBe("/project/.agent-shell/events");
            expect(result.error).toBeUndefined();
        });
    });

    describe("given AGENTSHELL_LOG_DIR is a relative path within the project", () => {
        it("should resolve it relative to the project root, not the OS working directory", async () => {
            // Arrange
            const deps = createMockDeps({});
            const env = { AGENTSHELL_LOG_DIR: "custom-logs" };

            // Act
            const result = await resolveReadEventsDir(env, deps);

            // Assert
            expect(result.dir).toBe("/project/custom-logs");
            expect(result.error).toBeUndefined();
        });
    });

    describe("given AGENTSHELL_LOG_DIR does not exist", () => {
        it("should return an error instead of throwing for ENOENT", async () => {
            // Arrange
            const enoent = Object.assign(
                new Error("ENOENT: no such file or directory"),
                { code: "ENOENT" },
            );
            const deps = createMockDeps(
                {},
                {
                    realpath: vi.fn().mockImplementation(async (p: string) => {
                        if (p === "/project") return "/project";
                        throw enoent;
                    }),
                },
            );
            const env = { AGENTSHELL_LOG_DIR: "/project/nonexistent-logs" };

            // Act
            const result = await resolveReadEventsDir(env, deps);

            // Assert
            expect(result.error).toBe(
                "AGENTSHELL_LOG_DIR does not exist or is not a directory",
            );
            expect(result.dir).toBe("");
        });

        it("should return an error instead of throwing for ENOTDIR", async () => {
            // Arrange
            const enotdir = Object.assign(
                new Error("ENOTDIR: not a directory"),
                { code: "ENOTDIR" },
            );
            const deps = createMockDeps(
                {},
                {
                    realpath: vi.fn().mockImplementation(async (p: string) => {
                        if (p === "/project") return "/project";
                        throw enotdir;
                    }),
                },
            );
            const env = { AGENTSHELL_LOG_DIR: "/project/file-not-dir/logs" };

            // Act
            const result = await resolveReadEventsDir(env, deps);

            // Assert
            expect(result.error).toBe(
                "AGENTSHELL_LOG_DIR does not exist or is not a directory",
            );
            expect(result.dir).toBe("");
        });
    });

    describe("given AGENTSHELL_LOG_DIR triggers a permission error", () => {
        it("should re-throw the error", async () => {
            // Arrange
            const eacces = Object.assign(
                new Error("EACCES: permission denied"),
                { code: "EACCES" },
            );
            const deps = createMockDeps(
                {},
                {
                    realpath: vi.fn().mockImplementation(async (p: string) => {
                        if (p === "/project") return "/project";
                        throw eacces;
                    }),
                },
            );
            const env = { AGENTSHELL_LOG_DIR: "/project/restricted-logs" };

            // Act & Assert
            await expect(resolveReadEventsDir(env, deps)).rejects.toThrow(
                "EACCES: permission denied",
            );
        });
    });

    describe("given AGENTSHELL_LOG_DIR is a relative traversal path", () => {
        it("should return an error for paths escaping the project root", async () => {
            // Arrange
            const deps = createMockDeps(
                {},
                {
                    realpath: vi
                        .fn()
                        .mockImplementation(async (p: string) => p),
                },
            );
            const env = { AGENTSHELL_LOG_DIR: "../../etc" };

            // Act
            const result = await resolveReadEventsDir(env, deps);

            // Assert
            expect(result.error).toContain("outside project root");
            expect(result.dir).toBe("");
        });
    });
});

describe("session listing", () => {
    it("should return session summaries sorted by most recent", async () => {
        // Arrange
        const olderTimestamp = "2024-01-01T10:00:00.000Z";
        const newerTimestamp = "2024-01-02T10:00:00.000Z";

        const oldEvent = buildScriptEndEvent({ timestamp: olderTimestamp });
        const newEvent = buildScriptEndEvent({ timestamp: newerTimestamp });

        const deps = createMockDeps({
            "old-session.jsonl": {
                lines: [JSON.stringify(oldEvent)],
                mtimeMs: 1000,
            },
            "new-session.jsonl": {
                lines: [JSON.stringify(newEvent)],
                mtimeMs: 2000,
            },
        });

        // Act
        const result = await listSessions("/events", deps);

        // Assert
        expect(result).toHaveLength(2);
        expect(result[0].sessionId).toBe("new-session");
        expect(result[1].sessionId).toBe("old-session");
    });

    it("should include correct event count and distinct actors", async () => {
        // Arrange
        const actor1 = chance.word();
        const actor2 = chance.word();
        const event1 = buildScriptEndEvent({ actor: actor1 });
        const event2 = buildScriptEndEvent({ actor: actor2 });
        const event3 = buildScriptEndEvent({ actor: actor1 });

        const deps = createMockDeps({
            "session.jsonl": {
                lines: [
                    JSON.stringify(event1),
                    JSON.stringify(event2),
                    JSON.stringify(event3),
                ],
                mtimeMs: 1000,
            },
        });

        // Act
        const result = await listSessions("/events", deps);

        // Assert
        expect(result).toHaveLength(1);
        expect(result[0].eventCount).toBe(3);
        expect(result[0].actors).toHaveLength(2);
        expect(result[0].actors).toContain(actor1);
        expect(result[0].actors).toContain(actor2);
    });

    it("should return an empty array when no files exist", async () => {
        // Arrange
        const deps = createMockDeps({});

        // Act
        const result = await listSessions("/events", deps);

        // Assert
        expect(result).toEqual([]);
    });
});
