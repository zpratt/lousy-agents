// biome-ignore-all lint/style/useNamingConvention: mirrors Node.js/Claude hook API naming (isTTY, snake_case)

import { tmpdir } from "node:os";
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

    try {
        await contextCommand.run?.({
            rawArgs: [],
            args: { _: [], files: options.files ?? "" },
            cmd: contextCommand,
            data: { targetDir: options.targetDir ?? "/repo" },
        });
    } finally {
        writeSpy.mockRestore();
        process.exitCode = origExitCode;
    }

    const stdout = stdoutChunks.join("");
    return { stdout };
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
            const { stdout } = await runContext({ stdin: "not-json-at-all" });

            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.additionalContext).toBe("");
            expect(process.exitCode).not.toBe(1);
        });
    });

    describe("when stdin matches no known hook schema", () => {
        it("fails open: emits empty additionalContext and exits 0", async () => {
            const { stdout } = await runContext({
                stdin: JSON.stringify({ unexpected: "object" }),
            });

            const parsed = JSON.parse(stdout);
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

    describe("when --files contains a path that escapes rootDir", () => {
        it("silently skips the out-of-scope file and emits valid hook JSON (path confinement, fail-open)", async () => {
            // "../outside.ts" resolves outside rootDir; resolveSafePath rejects it
            const { stdout } = await runContext({
                files: "../outside.ts",
                targetDir: tmpdir(),
            });

            // stdout must be exactly one valid JSON object — not corrupted by the traversal path
            const parsed = JSON.parse(stdout);
            expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(typeof parsed.hookSpecificOutput.additionalContext).toBe(
                "string",
            );
        });
    });
});
