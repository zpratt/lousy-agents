import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInitHooks } = vi.hoisted(() => ({
    mockInitHooks: vi.fn(),
}));

vi.mock("@lousy-agents/core/gateways/init-hooks-config-gateway.js", () => ({
    createInitHooksConfigGateway: vi.fn(() => ({
        initHooks: mockInitHooks,
    })),
}));

async function runInitHooks(options: {
    force?: boolean;
    noSessionStart?: boolean;
    targetDir?: string;
}) {
    const { initHooksCommand } = await import("./init-hooks.js");

    const origExitCode = process.exitCode;
    process.exitCode = 0;
    let code: number | undefined;

    try {
        await initHooksCommand.run?.({
            rawArgs: [],
            args: {
                _: [],
                force: options.force ?? false,
                "no-session-start": options.noSessionStart ?? false,
            },
            cmd: initHooksCommand,
            data: { targetDir: options.targetDir ?? "/repo" },
        });
    } finally {
        code = process.exitCode;
        process.exitCode = origExitCode;
    }
    return { exitCode: code };
}

describe("init-hooks command", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("when hook config is successfully written", () => {
        it("exits 0", async () => {
            mockInitHooks.mockResolvedValue({
                written: ["/repo/.claude/settings.json"],
                skipped: [],
            });

            const { exitCode } = await runInitHooks({});
            expect(exitCode).toBe(0);
        });
    });

    describe("when --no-session-start is not passed, addSessionStart defaults to true", () => {
        it("calls gateway with addSessionStart: true", async () => {
            mockInitHooks.mockResolvedValue({
                written: ["/repo/.claude/settings.json"],
                skipped: [],
            });

            await runInitHooks({ noSessionStart: false });

            expect(mockInitHooks).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ addSessionStart: true }),
            );
        });
    });

    describe("when --no-session-start is passed, addSessionStart is false", () => {
        it("calls gateway with addSessionStart: false", async () => {
            mockInitHooks.mockResolvedValue({
                written: ["/repo/.claude/settings.json"],
                skipped: [],
            });

            await runInitHooks({ noSessionStart: true });

            expect(mockInitHooks).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ addSessionStart: false }),
            );
        });
    });

    describe("when the file is already configured (skipped)", () => {
        it("exits 0", async () => {
            mockInitHooks.mockResolvedValue({
                written: [],
                skipped: ["/repo/.claude/settings.json"],
            });

            const { exitCode } = await runInitHooks({});
            expect(exitCode).toBe(0);
        });
    });

    describe("when the gateway throws", () => {
        it("sets exit code to 1", async () => {
            mockInitHooks.mockRejectedValue(new Error("Write error"));

            const { exitCode } = await runInitHooks({});
            expect(exitCode).toBe(1);
        });
    });
});
