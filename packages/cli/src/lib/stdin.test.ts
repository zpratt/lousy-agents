// biome-ignore-all lint/style/useNamingConvention: isTTY mirrors Node.js API naming
import { afterEach, describe, expect, it, vi } from "vitest";
import { readStdin } from "./stdin.js";

type StdinMock = {
    isTTY: boolean;
    pause: ReturnType<typeof vi.fn>;
    listeners: Record<string, ((data?: unknown) => void)[]>;
    on: (event: string, cb: (data?: unknown) => void) => StdinMock;
    emit: (event: string, data?: unknown) => void;
};

function makeStdinMock(): StdinMock {
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
    return mock;
}

describe("readStdin()", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("given a TTY stdin", () => {
        it("resolves immediately with empty text and capped false", async () => {
            const mock = makeStdinMock();
            mock.isTTY = true;
            vi.spyOn(process, "stdin", "get").mockReturnValue(
                mock as unknown as NodeJS.ReadStream & { fd: 0 },
            );

            const result = await readStdin();

            expect(result).toEqual({ text: "", capped: false });
        });
    });

    describe("given normal stdin data", () => {
        it("resolves with the concatenated text and capped false", async () => {
            const mock = makeStdinMock();
            vi.spyOn(process, "stdin", "get").mockReturnValue(
                mock as unknown as NodeJS.ReadStream & { fd: 0 },
            );

            setTimeout(() => {
                mock.emit("data", Buffer.from("hello "));
                mock.emit("data", Buffer.from("world"));
                mock.emit("end");
            }, 0);

            const result = await readStdin();
            expect(result).toEqual({ text: "hello world", capped: false });
        });
    });

    describe("given stdin data that exceeds the size cap", () => {
        it("resolves with capped true and calls stdin.pause()", async () => {
            const mock = makeStdinMock();
            vi.spyOn(process, "stdin", "get").mockReturnValue(
                mock as unknown as NodeJS.ReadStream & { fd: 0 },
            );

            setTimeout(() => {
                // 1_100_000 bytes > STDIN_MAX_BYTES (1_048_576)
                mock.emit("data", Buffer.alloc(1_100_000, "x"));
                mock.emit("end");
            }, 0);

            const result = await readStdin();
            expect(result).toEqual({ text: "", capped: true });
            expect(mock.pause).toHaveBeenCalledTimes(1);
        });
    });

    describe("given a stdin I/O error", () => {
        it("resolves with empty text and capped false", async () => {
            const mock = makeStdinMock();
            vi.spyOn(process, "stdin", "get").mockReturnValue(
                mock as unknown as NodeJS.ReadStream & { fd: 0 },
            );

            setTimeout(() => {
                mock.emit("error");
            }, 0);

            const result = await readStdin();
            expect(result).toEqual({ text: "", capped: false });
        });
    });

    describe("given stdin data exceeds cap and then an error fires", () => {
        it("resolves with capped true (error after cap does not re-fulfill)", async () => {
            const mock = makeStdinMock();
            vi.spyOn(process, "stdin", "get").mockReturnValue(
                mock as unknown as NodeJS.ReadStream & { fd: 0 },
            );

            setTimeout(() => {
                // First: overflow the cap
                mock.emit("data", Buffer.alloc(1_100_000, "x"));
                // Then: error fires on the paused stream
                mock.emit("error");
            }, 0);

            const result = await readStdin();
            // Cap wins — error after cap must not change the result
            expect(result).toEqual({ text: "", capped: true });
        });
    });
});
