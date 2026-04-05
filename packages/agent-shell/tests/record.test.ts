// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { RecordDeps } from "../src/record.js";
import { handleRecord } from "../src/record.js";
import type { TelemetryDeps } from "../src/telemetry.js";

const chance = new Chance();

function createMockTelemetryDeps(): TelemetryDeps & { written: string[] } {
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
    };
}

function createMockDeps(
    stdinPayload: unknown,
    overrides?: Partial<RecordDeps>,
): RecordDeps & {
    stderr: string[];
    telemetryDeps: TelemetryDeps & { written: string[] };
} {
    const stderr: string[] = [];
    const telemetryDeps = createMockTelemetryDeps();
    return {
        readStdin: vi.fn().mockResolvedValue(JSON.stringify(stdinPayload)),
        writeStderr: vi.fn().mockImplementation((msg: string) => {
            stderr.push(msg);
        }),
        env: { AGENTSHELL_SESSION_ID: chance.guid() },
        telemetryDeps,
        getRepositoryRoot: vi.fn().mockReturnValue("/project"),
        stderr,
        ...overrides,
    };
}

describe("handleRecord", () => {
    describe("given a terminal tool with valid toolArgs containing a command", () => {
        it("should emit a tool_use event with the extracted command", async () => {
            // Arrange
            const command = chance.word();
            const payload = {
                toolName: "bash",
                toolArgs: JSON.stringify({ command }),
            };
            const deps = createMockDeps(payload);

            // Act
            const result = await handleRecord(deps);

            // Assert
            expect(result).toBe(true);
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.event).toBe("tool_use");
            expect(parsed.tool_name).toBe("bash");
            expect(parsed.command).toBe(command);
        });
    });

    describe("given a non-terminal tool", () => {
        it("should emit a tool_use event with an empty command", async () => {
            // Arrange
            const toolName = chance.pickone(["file_edit", "curl", "npm"]);
            const payload = { toolName };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.tool_name).toBe(toolName);
            expect(parsed.command).toBe("");
        });
    });

    describe("given a terminal tool with non-string toolArgs", () => {
        it("should emit a tool_use event with empty command", async () => {
            // Arrange
            const payload = {
                toolName: "bash",
                toolArgs: { command: chance.word() },
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.command).toBe("");
        });
    });

    describe("given a terminal tool with toolArgs that is not valid JSON", () => {
        it("should emit a tool_use event with empty command", async () => {
            // Arrange
            const payload = {
                toolName: "sh",
                toolArgs: "not-valid-json{",
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.command).toBe("");
        });
    });

    describe("given a terminal tool with toolArgs that is an array", () => {
        it("should emit a tool_use event with empty command", async () => {
            // Arrange
            const payload = {
                toolName: "zsh",
                toolArgs: JSON.stringify([chance.word()]),
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.command).toBe("");
        });
    });

    describe("given a terminal tool with toolArgs missing command field", () => {
        it("should emit a tool_use event with empty command", async () => {
            // Arrange
            const payload = {
                toolName: "bash",
                toolArgs: JSON.stringify({ other: chance.word() }),
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.command).toBe("");
        });
    });

    describe("given a terminal tool with non-string command field", () => {
        it("should emit a tool_use event with empty command", async () => {
            // Arrange
            const payload = {
                toolName: "ash",
                toolArgs: JSON.stringify({
                    command: chance.integer({ min: 1, max: 100 }),
                }),
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.command).toBe("");
        });
    });

    describe("given a terminal tool with __proto__ key in toolArgs", () => {
        it("should emit a tool_use event with empty command", async () => {
            // Arrange
            const payload = {
                toolName: "bash",
                toolArgs: '{"__proto__": {"command": "evil"}, "command": "ls"}',
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.command).toBe("");
        });
    });

    describe("given a terminal tool with constructor key in toolArgs", () => {
        it("should emit a tool_use event with empty command", async () => {
            // Arrange
            const payload = {
                toolName: "bash",
                toolArgs:
                    '{"constructor": {"command": "evil"}, "command": "ls"}',
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.command).toBe("");
        });
    });

    describe("given a terminal tool with prototype key in toolArgs", () => {
        it("should emit a tool_use event with empty command", async () => {
            // Arrange
            const payload = {
                toolName: "bash",
                toolArgs:
                    '{"prototype": {"command": "evil"}, "command": "ls"}',
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.command).toBe("");
        });
    });

    describe("given getRepositoryRoot throws", () => {
        it("should write a diagnostic to stderr and return false", async () => {
            // Arrange
            const payload = {
                toolName: "bash",
                toolArgs: JSON.stringify({ command: "ls" }),
            };
            const deps = createMockDeps(payload);
            deps.getRepositoryRoot = vi
                .fn()
                .mockImplementation(() => {
                    throw new Error("not a git repo");
                });

            // Act
            const result = await handleRecord(deps);

            // Assert
            expect(deps.stderr.join("")).toContain("telemetry write error");
            expect(result).toBe(false);
            expect(deps.telemetryDeps.written).toHaveLength(0);
        });
    });

    describe("given invalid JSON from stdin", () => {
        it("should write a diagnostic to stderr and return false", async () => {
            // Arrange
            const deps = createMockDeps({});
            deps.readStdin = vi.fn().mockResolvedValue("not valid json{");

            // Act
            const result = await handleRecord(deps);

            // Assert
            expect(deps.stderr.join("")).toContain(
                "failed to parse stdin as JSON",
            );
            expect(result).toBe(false);
            expect(deps.telemetryDeps.written).toHaveLength(0);
        });
    });

    describe("given missing toolName field", () => {
        it("should write a diagnostic to stderr and skip telemetry", async () => {
            // Arrange
            const payload = { toolArgs: JSON.stringify({ command: "ls" }) };
            const deps = createMockDeps(payload);

            // Act
            const result = await handleRecord(deps);

            // Assert
            expect(deps.stderr.join("")).toContain(
                "missing or invalid toolName",
            );
            expect(result).toBe(false);
            expect(deps.telemetryDeps.written).toHaveLength(0);
        });
    });

    describe("given toolName is not a string", () => {
        it("should write a diagnostic to stderr and skip telemetry", async () => {
            // Arrange
            const payload = { toolName: 42 };
            const deps = createMockDeps(payload);

            // Act
            const result = await handleRecord(deps);

            // Assert
            expect(deps.stderr.join("")).toContain(
                "missing or invalid toolName",
            );
            expect(result).toBe(false);
            expect(deps.telemetryDeps.written).toHaveLength(0);
        });
    });

    describe("given toolName exceeds 1024 characters", () => {
        it("should write a diagnostic to stderr and skip telemetry", async () => {
            // Arrange
            const payload = { toolName: "a".repeat(1025) };
            const deps = createMockDeps(payload);

            // Act
            const result = await handleRecord(deps);

            // Assert
            expect(deps.stderr.join("")).toContain(
                "missing or invalid toolName",
            );
            expect(result).toBe(false);
            expect(deps.telemetryDeps.written).toHaveLength(0);
        });
    });

    describe("given telemetry emission fails", () => {
        it("should log the error to stderr and return false", async () => {
            // Arrange
            const payload = {
                toolName: "bash",
                toolArgs: JSON.stringify({ command: "ls" }),
            };
            const deps = createMockDeps(payload);
            deps.telemetryDeps.appendFile = vi
                .fn()
                .mockRejectedValue(new Error("disk full"));

            // Act
            const result = await handleRecord(deps);

            // Assert
            expect(deps.stderr.join("")).toContain("telemetry write error");
            expect(result).toBe(false);
        });
    });

    describe("given stdin read fails", () => {
        it("should write a diagnostic to stderr and return false", async () => {
            // Arrange
            const deps = createMockDeps({});
            deps.readStdin = vi
                .fn()
                .mockRejectedValue(
                    new Error("stdin exceeds maximum allowed size"),
                );

            // Act
            const result = await handleRecord(deps);

            // Assert
            expect(deps.stderr.join("")).toContain("failed to read stdin");
            expect(result).toBe(false);
        });
    });

    describe("given a terminal tool with command exceeding MAX_COMMAND_BYTES", () => {
        it("should truncate the command to 4096 bytes", async () => {
            // Arrange — use multi-byte chars to verify byte-aware truncation
            const longCommand = "a".repeat(5000);
            const payload = {
                toolName: "bash",
                toolArgs: JSON.stringify({ command: longCommand }),
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(parsed.command).toHaveLength(4096);
        });
    });

    describe("given a terminal tool with multi-byte command exceeding MAX_COMMAND_BYTES", () => {
        it("should truncate at byte boundary, not character count", async () => {
            // Arrange — each emoji is 4 UTF-8 bytes; 1025 = 4100 bytes > 4096
            const emoji = "\uD83D\uDE00"; // 😀 = 4 bytes in UTF-8
            const longCommand = emoji.repeat(1025);
            const payload = {
                toolName: "bash",
                toolArgs: JSON.stringify({ command: longCommand }),
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            // Byte-aware truncation: 4096 bytes / 4 bytes per emoji = 1024 emojis max
            expect(Buffer.byteLength(parsed.command, "utf-8")).toBeLessThanOrEqual(4096);
        });
    });

    describe("given a terminal tool with 3-byte command chars that split at the truncation boundary", () => {
        it("should truncate at a valid codepoint boundary without exceeding MAX_COMMAND_BYTES", async () => {
            // Arrange — '€' is 3 UTF-8 bytes; 1366 chars = 4098 bytes (2 bytes over limit)
            // This specifically exercises the split-sequence case that raw Buffer.subarray mishandles
            const euro = "€"; // 3 bytes in UTF-8
            const longCommand = euro.repeat(1366); // 4098 bytes
            const payload = {
                toolName: "bash",
                toolArgs: JSON.stringify({ command: longCommand }),
            };
            const deps = createMockDeps(payload);

            // Act
            await handleRecord(deps);

            // Assert
            expect(deps.telemetryDeps.written).toHaveLength(1);
            const parsed = JSON.parse(deps.telemetryDeps.written[0]);
            expect(Buffer.byteLength(parsed.command, "utf-8")).toBeLessThanOrEqual(4096);
        });
    });

    describe("given all terminal tool variants", () => {
        for (const tool of ["bash", "zsh", "ash", "sh"]) {
            it(`should extract command for ${tool}`, async () => {
                // Arrange
                const command = chance.word();
                const payload = {
                    toolName: tool,
                    toolArgs: JSON.stringify({ command }),
                };
                const deps = createMockDeps(payload);

                // Act
                await handleRecord(deps);

                // Assert
                expect(deps.telemetryDeps.written).toHaveLength(1);
                const parsed = JSON.parse(deps.telemetryDeps.written[0]);
                expect(parsed.command).toBe(command);
            });
        }
    });
});
