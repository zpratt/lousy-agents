/**
 * Verifies that the `lint` parent command returns early when a known
 * subcommand is present in rawArgs (same guard pattern as `new.ts`).
 * This prevents citty from double-executing the parent's `run` alongside
 * the subcommand's `run`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunLint } = vi.hoisted(() => ({
    mockRunLint: vi.fn().mockResolvedValue({ outputs: [], hasErrors: false }),
}));

vi.mock("@lousy-agents/lint", () => ({
    runLint: mockRunLint,
    createFormatter: vi
        .fn()
        .mockReturnValue({ format: vi.fn().mockReturnValue("") }),
    // biome-ignore lint/style/useNamingConvention: class mock must preserve PascalCase to match the real export name
    LintValidationError: class LintValidationError extends Error {},
}));

describe("lint command — lessons subcommand guard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("when rawArgs starts with 'lessons'", () => {
        it("returns without calling runLint (avoids double-execution)", async () => {
            const { lintCommand } = await import("./lint.js");

            await lintCommand.run?.({
                rawArgs: ["lessons"],
                args: { _: [] },
                cmd: lintCommand,
                data: { targetDir: "/repo" },
            });

            expect(mockRunLint).not.toHaveBeenCalled();
        });
    });

    describe("when a flag precedes the 'lessons' subcommand in rawArgs", () => {
        it("returns without calling runLint (guard uses .includes, not [0])", async () => {
            const { lintCommand } = await import("./lint.js");

            await lintCommand.run?.({
                rawArgs: ["--format", "lessons"],
                args: { _: [] },
                cmd: lintCommand,
                data: { targetDir: "/repo" },
            });

            expect(mockRunLint).not.toHaveBeenCalled();
        });
    });

    describe("when rawArgs does not start with 'lessons'", () => {
        it("calls runLint normally", async () => {
            const { lintCommand } = await import("./lint.js");

            await lintCommand.run?.({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: "/repo", skills: true },
            });

            expect(mockRunLint).toHaveBeenCalledOnce();
        });
    });
});
