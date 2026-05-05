// biome-ignore-all lint/style/useNamingConvention: mirrors Node.js/Claude hook API naming (isTTY, snake_case)

import { tmpdir } from "node:os";
import { LessonContextUseCase } from "@lousy-agents/core/use-cases/lesson-context-use-case.js";
import type { LessonFileGatewayPort } from "@lousy-agents/core/use-cases/lesson-file-gateway-port.js";
import Chance from "chance";
import { afterEach, describe, expect, it, vi } from "vitest";

const chance = new Chance();

type StdinMock = {
    isTTY: boolean;
    listeners: Record<string, ((data?: unknown) => void)[]>;
    on: (event: string, cb: (data?: unknown) => void) => StdinMock;
    emit: (event: string, data?: unknown) => void;
};

function makeStdinMock(data: string): StdinMock {
    const mock: StdinMock = {
        isTTY: false,
        listeners: {},
        on(event, cb) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(cb);
            return this;
        },
        emit(event, payload) {
            for (const cb of this.listeners[event] ?? []) cb(payload);
        },
    };

    // Simulate data + end events async
    setTimeout(() => {
        if (data.length > 0) {
            mock.emit("data", Buffer.from(data));
        }
        mock.emit("end");
    }, 0);

    return mock;
}

async function runContext(options: {
    stdin?: string;
    files?: string;
    targetDir?: string;
    data?: Record<string, unknown>;
}) {
    const { contextCommand } = await import("./context.js");

    const stdoutChunks: string[] = [];
    const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: unknown) => {
            stdoutChunks.push(String(chunk));
            return true;
        });

    const stdinMock = makeStdinMock(options.stdin ?? "");
    vi.spyOn(process, "stdin", "get").mockReturnValue(
        stdinMock as unknown as NodeJS.ReadStream & { fd: 0 },
    );

    const origExitCode = process.exitCode;
    process.exitCode = 0;

    let exitCode = 0;
    try {
        await contextCommand.run?.({
            rawArgs: [],
            args: { _: [], files: options.files ?? "" },
            cmd: contextCommand,
            data: {
                targetDir: options.targetDir ?? "/repo",
                ...options.data,
            },
        });
    } finally {
        exitCode = process.exitCode as number;
        writeSpy.mockRestore();
        process.exitCode = origExitCode;
    }

    const stdout = stdoutChunks.join("");
    return { stdout, exitCode };
}

describe("context command", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("when stdin is empty and --files is not provided", () => {
        it("emits a SessionStart additionalContext JSON response", async () => {
            const { stdout } = await runContext({ stdin: "" });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe(
                "SessionStart",
            );
            expect(typeof parsed.hookSpecificOutput.additionalContext).toBe(
                "string",
            );
        });
    });

    describe("when stdin is a valid PreToolUse payload", () => {
        it("emits a PreToolUse additionalContext JSON response", async () => {
            const stdinPayload = JSON.stringify({
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Bash",
                tool_input: { command: "ls" },
            });

            const { stdout } = await runContext({ stdin: stdinPayload });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
        });
    });

    describe("when stdin is a valid SessionStart payload", () => {
        it("emits a SessionStart additionalContext JSON response", async () => {
            const stdinPayload = JSON.stringify({
                hook_event_name: "SessionStart",
                session_id: chance.guid(),
            });

            const { stdout } = await runContext({ stdin: stdinPayload });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe(
                "SessionStart",
            );
        });
    });

    describe("when stdin contains invalid JSON", () => {
        it("fails open: emits empty additionalContext and exits 0", async () => {
            const { stdout, exitCode } = await runContext({
                stdin: "not-json-at-all",
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(parsed.hookSpecificOutput.additionalContext).toBe("");
            expect(exitCode).not.toBe(1);
        });

        it("emits PreToolUse even when the malformed payload resembles a SessionStart invocation", async () => {
            // A real SessionStart payload can never be malformed in practice (it's tiny),
            // but the contract is: non-empty stdin that is not valid JSON → PreToolUse fail-open.
            const { stdout, exitCode } = await runContext({
                stdin: "{hook_event_name: SessionStart", // truncated/invalid JSON
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(parsed.hookSpecificOutput.additionalContext).toBe("");
            expect(exitCode).not.toBe(1);
        });
    });

    describe("when stdin contains invalid JSON and --files is provided", () => {
        it("dispatches as PreToolUse without emitting a second schema-mismatch warning", async () => {
            const warnSpy = vi.spyOn((await import("consola")).default, "warn");

            const { stdout, exitCode } = await runContext({
                stdin: "not-json-at-all",
                files: "src/foo.ts",
                targetDir: "/repo",
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(exitCode).not.toBe(1);

            // Must not emit the spurious "stdin did not match any known hook schema" warning
            const warnMessages = warnSpy.mock.calls
                .map((args) => String(args[0]))
                .join("\n");
            expect(warnMessages).not.toContain(
                "stdin did not match any known hook schema",
            );

            warnSpy.mockRestore();
        });
    });

    describe("when stdin matches no known hook schema", () => {
        it("fails open: emits empty additionalContext and exits 0", async () => {
            const { stdout } = await runContext({
                stdin: JSON.stringify({ unexpected: "object" }),
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(parsed.hookSpecificOutput.additionalContext).toBe("");
        });
    });

    describe("when stdin is a valid PreToolUse Edit payload with file_path", () => {
        it("emits a PreToolUse additionalContext JSON response", async () => {
            const stdinPayload = JSON.stringify({
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Edit",
                tool_input: {
                    file_path: "src/foo.ts",
                    old_string: "before",
                    new_string: "after",
                },
            });

            const { stdout } = await runContext({ stdin: stdinPayload });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(typeof parsed.hookSpecificOutput.additionalContext).toBe(
                "string",
            );
        });
    });

    describe("when --files is provided alongside a SessionStart stdin payload", () => {
        it("switches to PreToolUse dispatch (--files overrides SessionStart)", async () => {
            const stdinPayload = JSON.stringify({
                hook_event_name: "SessionStart",
                session_id: chance.guid(),
            });

            const { stdout } = await runContext({
                stdin: stdinPayload,
                files: "src/foo.ts",
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
        });
    });

    describe("when --files is provided", () => {
        it("emits a PreToolUse additionalContext JSON response", async () => {
            const { stdout } = await runContext({
                files: "src/foo.ts,src/bar.ts",
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
        });
    });

    describe("when stdin contains a PreToolUse payload with file_path equal to rootDir", () => {
        it("skips the path with a warning and emits a valid PreToolUse response", async () => {
            const stdinPayload = JSON.stringify({
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Edit",
                tool_input: {
                    // Pointing at the workspace root itself, not a file
                    file_path: "/repo",
                    old_string: "before",
                    new_string: "after",
                },
            });

            const { stdout, exitCode } = await runContext({
                stdin: stdinPayload,
                targetDir: "/repo",
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(typeof parsed.hookSpecificOutput.additionalContext).toBe(
                "string",
            );
            expect(exitCode).not.toBe(1);
        });
    });

    describe("when stdin contains a PreToolUse payload with an absolute file_path within rootDir", () => {
        it("accepts the path and emits a PreToolUse JSON response", async () => {
            const stdinPayload = JSON.stringify({
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Edit",
                tool_input: {
                    // Absolute path that is inside /repo
                    file_path: "/repo/src/foo.ts",
                    old_string: "before",
                    new_string: "after",
                },
            });

            const { stdout, exitCode } = await runContext({
                stdin: stdinPayload,
                targetDir: "/repo",
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(typeof parsed.hookSpecificOutput.additionalContext).toBe(
                "string",
            );
            expect(exitCode).not.toBe(1);
        });
    });

    describe("when stdin contains a PreToolUse payload with an absolute file_path outside rootDir", () => {
        it("fails open: emits a PreToolUse JSON response (out-of-root absolute path dropped)", async () => {
            const stdinPayload = JSON.stringify({
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Edit",
                tool_input: {
                    file_path: "/etc/passwd",
                    old_string: "before",
                    new_string: "after",
                },
            });

            const { stdout, exitCode } = await runContext({
                stdin: stdinPayload,
                targetDir: "/repo",
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(typeof parsed.hookSpecificOutput.additionalContext).toBe(
                "string",
            );
            expect(exitCode).not.toBe(1);
        });
    });

    describe("when stdin is a valid PreToolUse Edit payload with file_path that escapes rootDir", () => {
        it("fails open: warns and drops the out-of-root file_path, emitting an empty-context PreToolUse response", async () => {
            const warnSpy = vi.spyOn((await import("consola")).default, "warn");

            const stdinPayload = JSON.stringify({
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Edit",
                tool_input: {
                    file_path: "../../etc/passwd",
                    old_string: "before",
                    new_string: "after",
                },
            });

            const { stdout } = await runContext({
                stdin: stdinPayload,
                targetDir: "/repo",
            });

            // Should still emit a valid JSON response (fail-open)
            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(typeof parsed.hookSpecificOutput.additionalContext).toBe(
                "string",
            );
            // The out-of-root path must have triggered a warning
            const rejectWarnings = warnSpy.mock.calls
                .map((args) => String(args[0]))
                .filter((msg) =>
                    msg.includes("stdin file_path rejected (escapes rootDir)"),
                );
            expect(rejectWarnings).toHaveLength(1);
            expect(rejectWarnings[0]).toContain("../../etc/passwd");

            warnSpy.mockRestore();
        });
    });

    describe("when --files contains a path that escapes rootDir (only path)", () => {
        it("exits 1 when all supplied paths are rejected (all paths out-of-root)", async () => {
            const { exitCode, stdout } = await runContext({
                files: "../outside.ts",
                targetDir: tmpdir(),
            });

            expect(exitCode).toBe(1);
            // A valid JSON envelope is always written so Claude's hook contract is satisfied
            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput).toBeDefined();
            expect(parsed.hookSpecificOutput.additionalContext).toBe("");
        });
    });

    describe("when --files contains an absolute in-root path", () => {
        it("normalizes the absolute path to workspace-relative before passing to the use case", async () => {
            const capturedInputs: unknown[] = [];
            const stubGateway: LessonFileGatewayPort = {
                readLessons: async () => ({ lessons: [], errors: [] }),
            };
            const stubbedUseCase = new LessonContextUseCase(stubGateway);
            vi.spyOn(stubbedUseCase, "execute").mockImplementation(
                async (input) => {
                    capturedInputs.push(input);
                    return {
                        additionalContext: "",
                        truncatedCount: 0,
                        gatewayErrors: [],
                    };
                },
            );

            const { exitCode, stdout } = await runContext({
                files: "/repo/src/foo.ts",
                targetDir: "/repo",
                data: { useCase: stubbedUseCase },
            });

            expect(exitCode).not.toBe(1);
            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            // The use case must have received the workspace-relative path
            expect(capturedInputs).toHaveLength(1);
            const input = capturedInputs[0] as { filePaths: string[] };
            expect(input.filePaths).toEqual(["src/foo.ts"]);
        });
    });

    describe("when --files contains a mix of valid and invalid paths", () => {
        it("drops only the out-of-root path, keeps the valid one, and emits a JSON response", async () => {
            const warnSpy = vi.spyOn((await import("consola")).default, "warn");

            const { exitCode, stdout } = await runContext({
                files: "src/foo.ts,../../etc/passwd",
                targetDir: tmpdir(),
            });

            expect(exitCode).not.toBe(1);
            // A valid JSON response must still be emitted (fail-open)
            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput).toBeDefined();
            // The out-of-root path must have been dropped with a warning
            const dropWarnings = warnSpy.mock.calls
                .map((args) => String(args[0]))
                .filter((msg) => msg.includes("--files path dropped"));
            expect(dropWarnings).toHaveLength(1);
            expect(dropWarnings[0]).toContain("../../etc/passwd");
            // The valid path must NOT have been dropped
            expect(dropWarnings.some((msg) => msg.includes("src/foo.ts"))).toBe(
                false,
            );

            warnSpy.mockRestore();
        });
    });

    describe("when --files contains a dot-dot-prefixed filename inside the workspace", () => {
        it("accepts and passes through the path (..filename is not a traversal)", async () => {
            const warnSpy = vi.spyOn((await import("consola")).default, "warn");

            const { exitCode, stdout } = await runContext({
                files: "..hidden",
                targetDir: tmpdir(),
            });

            expect(exitCode).not.toBe(1);
            // A valid JSON envelope must be emitted
            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput).toBeDefined();
            // ..hidden is inside the workspace — it must NOT have been dropped with an escapes-rootDir warning
            const escapeWarnings = warnSpy.mock.calls
                .map((args) => String(args[0]))
                .filter(
                    (msg) =>
                        msg.includes("escapes rootDir") ||
                        msg.includes("--files path dropped"),
                );
            expect(escapeWarnings).toHaveLength(0);

            warnSpy.mockRestore();
        });
    });

    describe("when --files is all-whitespace (no valid tokens)", () => {
        it("exits 1 when all --files tokens are blank", async () => {
            const { exitCode, stdout } = await runContext({
                files: "  ,  ,  ",
                targetDir: tmpdir(),
            });

            expect(exitCode).toBe(1);
            // A valid JSON envelope is always written so Claude's hook contract is satisfied
            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput).toBeDefined();
            expect(parsed.hookSpecificOutput.additionalContext).toBe("");
        });
    });

    describe("when stdin exceeds the size cap", () => {
        it("fails open: emits empty additionalContext and exits 0 without calling the lesson gateway", async () => {
            // Arrange
            const stubGateway: LessonFileGatewayPort = {
                readLessons: vi.fn(),
            };
            const injectedUseCase = new LessonContextUseCase(stubGateway);
            const oversized = JSON.stringify({
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Edit",
                tool_input: { extra: "x".repeat(1_100_000) },
            });

            // Act
            const { stdout, exitCode } = await runContext({
                stdin: oversized,
                data: { useCase: injectedUseCase },
            });

            // Assert — the capped stdin must NOT fall through to SessionStart lesson
            // injection: the command must emit an empty context envelope immediately.
            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput).toBeDefined();
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(parsed.hookSpecificOutput.additionalContext).toBe("");
            expect(exitCode).not.toBe(1);
            // Verify the lesson gateway was NOT called (gateway bypassed on cap)
            expect(stubGateway.readLessons).not.toHaveBeenCalled();
        });

        it("emits PreToolUse even when the oversized payload is a SessionStart invocation", async () => {
            // The cap check fires before any parsing — the invocation event type is
            // unknown. Per the fail-open contract, the response always uses "PreToolUse"
            // for non-empty-stdin cap hits (SessionStart payloads are tiny in practice;
            // oversized non-empty stdin is treated as a PreToolUse miss).
            const stubGateway: LessonFileGatewayPort = {
                readLessons: vi.fn(),
            };
            const injectedUseCase = new LessonContextUseCase(stubGateway);
            // Force over-the-cap size by embedding a large field
            const oversizedSessionStart = JSON.stringify({
                hook_event_name: "SessionStart",
                session_id: chance.guid(),
                extra: "x".repeat(1_100_000),
            });

            const { stdout, exitCode } = await runContext({
                stdin: oversizedSessionStart,
                data: { useCase: injectedUseCase },
            });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(parsed.hookSpecificOutput.additionalContext).toBe("");
            expect(exitCode).not.toBe(1);
            expect(stubGateway.readLessons).not.toHaveBeenCalled();
        });
    });

    describe("when stdin exceeds the size cap and --files is provided", () => {
        it("uses --files paths for PreToolUse dispatch and does not early-return with empty context", async () => {
            // Arrange
            const stubGateway: LessonFileGatewayPort = {
                readLessons: vi
                    .fn()
                    .mockResolvedValue({ lessons: [], errors: [] }),
            };
            const injectedUseCase = new LessonContextUseCase(stubGateway);
            const oversized = JSON.stringify({
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Edit",
                tool_input: { extra: "x".repeat(1_100_000) },
            });

            // Act
            const { stdout, exitCode } = await runContext({
                stdin: oversized,
                files: "src/foo.ts",
                data: { useCase: injectedUseCase },
            });

            // Assert — with --files provided the command must NOT early-return on cap;
            // it must proceed with PreToolUse dispatch using the explicit --files paths.
            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(exitCode).not.toBe(1);
            // Verify the lesson gateway WAS called (--files overrides the cap early-return)
            expect(stubGateway.readLessons).toHaveBeenCalled();
        });
    });
});
