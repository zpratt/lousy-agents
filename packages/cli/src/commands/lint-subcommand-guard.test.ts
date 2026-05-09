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
        it("returns without calling runLint (guard checks index, not --format value)", async () => {
            const { lintCommand } = await import("./lint.js");

            await lintCommand.run?.({
                rawArgs: ["--format", "human", "lessons"],
                args: { _: [] },
                cmd: lintCommand,
                data: { targetDir: "/repo" },
            });

            expect(mockRunLint).not.toHaveBeenCalled();
        });
    });

    describe("when 'lessons' is the value of the --format flag (not a subcommand)", () => {
        it("calls runLint normally (preceding --format token suppresses guard)", async () => {
            const { lintCommand } = await import("./lint.js");

            await lintCommand.run?.({
                rawArgs: ["--format", "lessons"],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: "/repo", skills: true },
            });

            expect(mockRunLint).toHaveBeenCalledOnce();
        });
    });

    describe("when --format value and subcommand name collide (--format lessons lessons)", () => {
        it("returns without calling runLint (second 'lessons' is the subcommand)", async () => {
            const { lintCommand } = await import("./lint.js");

            await lintCommand.run?.({
                rawArgs: ["--format", "lessons", "lessons"],
                args: { _: [] },
                cmd: lintCommand,
                data: { targetDir: "/repo" },
            });

            expect(mockRunLint).not.toHaveBeenCalled();
        });
    });

    describe("when rawArgs does not contain 'lessons'", () => {
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
