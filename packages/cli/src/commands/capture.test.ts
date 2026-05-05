// biome-ignore-all lint/style/useNamingConvention: mirrors Node.js/Claude hook API naming (isTTY, snake_case)
import Chance from "chance";
import { afterEach, describe, expect, it, vi } from "vitest";

const chance = new Chance();

type StdinMock = {
    isTTY: boolean;
    pause: ReturnType<typeof vi.fn>;
    listeners: Record<string, ((data?: unknown) => void)[]>;
    on: (event: string, cb: (data?: unknown) => void) => StdinMock;
    emit: (event: string, data?: unknown) => void;
};

function makeStdinMock(data: string): StdinMock {
    const mock: StdinMock = {
        isTTY: false,
        pause: vi.fn(),
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

    setTimeout(() => {
        if (data.length > 0) {
            mock.emit("data", Buffer.from(data));
        }
        mock.emit("end");
    }, 0);

    return mock;
}

function makeLoggerStub() {
    return {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
    };
}

async function runCapture(
    stdin: string,
    options: {
        logger?: ReturnType<typeof makeLoggerStub>;
        stdinMock?: StdinMock;
    } = {},
) {
    const { captureCommand } = await import("./capture.js");

    const stdoutChunks: string[] = [];
    const _writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: unknown) => {
            stdoutChunks.push(String(chunk));
            return true;
        });

    const stdinMock = options.stdinMock ?? makeStdinMock(stdin);
    vi.spyOn(process, "stdin", "get").mockReturnValue(
        stdinMock as unknown as NodeJS.ReadStream & { fd: 0 },
    );

    const origExitCode = process.exitCode;
    process.exitCode = 0;

    let exitCode = 0;
    try {
        await captureCommand.run?.({
            rawArgs: [],
            args: { _: [] },
            cmd: captureCommand,
            data: {
                ...(options.logger ? { logger: options.logger } : {}),
            },
        });
    } finally {
        exitCode = process.exitCode as number;
        process.exitCode = origExitCode;
    }

    return { stdout: stdoutChunks.join(""), exitCode };
}

describe("capture command", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("given a Stop hook payload on stdin", () => {
        it("writes the Stop capture template to stdout", async () => {
            const { stdout } = await runCapture(
                JSON.stringify({
                    hook_event_name: "Stop",
                    session_id: chance.guid(),
                }),
            );

            expect(stdout).toContain("finished a coding session");
            expect(stdout).toContain(".lousy-agents/lessons/");
            expect(stdout).not.toContain("subagent");
        });
    });

    describe("given a SubagentStop hook payload on stdin", () => {
        it("writes the SubagentStop capture template to stdout", async () => {
            const { stdout } = await runCapture(
                JSON.stringify({
                    hook_event_name: "SubagentStop",
                    session_id: chance.guid(),
                }),
            );

            expect(stdout).toContain("subagent");
            expect(stdout).toContain(".lousy-agents/lessons/");
        });
    });

    describe("given empty stdin", () => {
        it("exits 0 without writing to stdout and warns once (fail-open)", async () => {
            const logger = makeLoggerStub();
            const { stdout, exitCode } = await runCapture("", { logger });

            expect(stdout).toBe("");
            expect(exitCode).not.toBe(1);
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn.mock.calls[0]?.[0]).toContain("no hook input");
        });
    });

    describe("when stdin exceeds the size cap", () => {
        it("exits 0 without writing to stdout, emits exactly one warning, and pauses the stream (fail-open)", async () => {
            // Arrange — inject a stub logger to avoid partial mocks on the consola singleton
            const logger = makeLoggerStub();
            // Build a mock with pause() so we can assert it was called
            const mock: StdinMock = {
                isTTY: false,
                pause: vi.fn(),
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
            setTimeout(() => {
                // 1_100_000 bytes > STDIN_MAX_BYTES (1_048_576) — intentionally over-limit
                mock.emit("data", Buffer.alloc(1_100_000, "x"));
                mock.emit("end");
            }, 0);

            // Act
            const { stdout, exitCode } = await runCapture("", {
                logger,
                stdinMock: mock,
            });

            // Assert
            expect(stdout).toBe("");
            expect(exitCode).not.toBe(1);
            // Exactly one warning: the cap warning. Must NOT fall through to
            // the "no hook input" path (which would emit a second, misleading warning).
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn.mock.calls[0]?.[0]).toContain("exceeds");
            // Stream must be paused on overflow
            expect(mock.pause).toHaveBeenCalledTimes(1);
        });
    });

    describe("given a TTY stdin", () => {
        it("exits 0 without writing to stdout and warns about missing input (fail-open)", async () => {
            const logger = makeLoggerStub();
            const mock: StdinMock = {
                isTTY: true,
                pause: vi.fn(),
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

            const { stdout, exitCode } = await runCapture("", {
                logger,
                stdinMock: mock,
            });

            expect(stdout).toBe("");
            expect(exitCode).not.toBe(1);
            // TTY = no stdin data → falls through to the "no hook input" warning path
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn.mock.calls[0]?.[0]).toContain("no hook input");
        });
    });

    describe("given non-JSON stdin", () => {
        it("exits 0 without writing to stdout and warns once (fail-open)", async () => {
            const logger = makeLoggerStub();
            const { stdout } = await runCapture("not-valid-json", { logger });

            expect(stdout).toBe("");
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn.mock.calls[0]?.[0]).toContain("not valid JSON");
        });
    });

    describe("given an unknown hook schema on stdin", () => {
        it("exits 0 without writing to stdout and warns once (fail-open)", async () => {
            const logger = makeLoggerStub();
            const { stdout } = await runCapture(
                JSON.stringify({
                    hook_event_name: "PreToolUse",
                    session_id: chance.guid(),
                }),
                { logger },
            );

            // PreToolUse doesn't match Stop or SubagentStop, so no output
            expect(stdout).toBe("");
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn.mock.calls[0]?.[0]).toContain(
                "did not match Stop or SubagentStop",
            );
        });
    });
});
