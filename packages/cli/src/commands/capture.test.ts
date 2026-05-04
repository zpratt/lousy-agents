// biome-ignore-all lint/style/useNamingConvention: mirrors Node.js/Claude hook API naming (isTTY, snake_case)
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

    setTimeout(() => {
        if (data.length > 0) {
            mock.emit("data", Buffer.from(data));
        }
        mock.emit("end");
    }, 0);

    return mock;
}

async function runCapture(stdin: string) {
    const { captureCommand } = await import("./capture.js");

    const stdoutChunks: string[] = [];
    const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: unknown) => {
            stdoutChunks.push(String(chunk));
            return true;
        });

    const stdinMock = makeStdinMock(stdin);
    vi.spyOn(process, "stdin", "get").mockReturnValue(
        stdinMock as unknown as NodeJS.ReadStream & { fd: 0 },
    );

    const origExitCode = process.exitCode;
    process.exitCode = 0;

    try {
        await captureCommand.run?.({
            rawArgs: [],
            args: { _: [] },
            cmd: captureCommand,
            data: {},
        });
    } finally {
        writeSpy.mockRestore();
        process.exitCode = origExitCode;
    }

    return { stdout: stdoutChunks.join("") };
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
        it("exits 0 without writing to stdout (fail-open)", async () => {
            const { stdout } = await runCapture("");

            expect(stdout).toBe("");
            expect(process.exitCode).not.toBe(1);
        });
    });

    describe("given non-JSON stdin", () => {
        it("exits 0 without writing to stdout (fail-open)", async () => {
            const { stdout } = await runCapture("not-valid-json");

            expect(stdout).toBe("");
        });
    });

    describe("given an unknown hook schema on stdin", () => {
        it("exits 0 without writing to stdout (fail-open)", async () => {
            const { stdout } = await runCapture(
                JSON.stringify({
                    hook_event_name: "PreToolUse",
                    session_id: chance.guid(),
                }),
            );

            // PreToolUse doesn't match Stop or SubagentStop, so no output
            expect(stdout).toBe("");
        });
    });
});
