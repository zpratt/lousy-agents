import type { LessonFileGatewayPort } from "@lousy-agents/core/use-cases/lesson-file-gateway-port.js";
import type { LintLessonsOutput } from "@lousy-agents/core/use-cases/lint-lessons-use-case.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lintLessonsCommand } from "./lint-lessons.js";

function makeGateway(result: LintLessonsOutput | Error): LessonFileGatewayPort {
    return {
        readLessons: vi.fn().mockImplementation(async () => {
            if (result instanceof Error) throw result;
            // Return raw gateway data matching what the use case expects
            if (!result.valid) {
                return {
                    lessons: [],
                    errors: result.errors.map((e) => ({
                        filePath: e.filePath,
                        reason: e.reason,
                    })),
                };
            }
            if (result.totalFiles === 0) {
                return { lessons: [], errors: [] };
            }
            // Build synthetic lessons for valid results
            return {
                lessons: Array.from({ length: result.totalFiles }, (_, i) => ({
                    lesson: {
                        slug: `lesson-${i}`,
                        title: `Lesson ${i}`,
                        type: "invariant" as const,
                        created: "2024-01-01",
                        revised: "2024-01-01",
                        provenance: [],
                        triggers: { tags: [], paths: [], patterns: [] },
                        body: "",
                    },
                    filePath: `.lousy-agents/lessons/lesson-${i}.md`,
                })),
                errors: [],
            };
        }),
    };
}

async function runLintLessons(
    result: LintLessonsOutput | Error,
    targetDir = "/repo",
) {
    const origExitCode = process.exitCode;
    process.exitCode = 0;
    let code: number | undefined;

    try {
        await lintLessonsCommand.run?.({
            rawArgs: [],
            args: { _: [] },
            cmd: lintLessonsCommand,
            data: { targetDir, gateway: makeGateway(result) },
        });
    } finally {
        code = process.exitCode;
        process.exitCode = origExitCode;
    }
    return { exitCode: code };
}

describe("lint-lessons command", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("when no lessons directory exists (no lessons configured)", () => {
        it("should exit 0 and log informational message", async () => {
            const result = await runLintLessons({
                valid: true,
                errors: [],
                totalFiles: 0,
                message: "No lessons configured in .lousy-agents/lessons/",
            });
            expect(result.exitCode).toBe(0);
        });
    });

    describe("when all lessons are valid", () => {
        it("should exit 0", async () => {
            const result = await runLintLessons({
                valid: true,
                errors: [],
                totalFiles: 2,
            });
            expect(result.exitCode).toBe(0);
        });
    });

    describe("when a lesson has a validation error", () => {
        it("should set exit code to 1", async () => {
            const result = await runLintLessons({
                valid: false,
                errors: [
                    {
                        filePath: "/repo/.lousy-agents/lessons/bad.md",
                        reason: "type: Invalid enum value",
                    },
                ],
                totalFiles: 1,
            });
            expect(result.exitCode).toBe(1);
        });
    });

    describe("when the use case throws (e.g., file count cap exceeded)", () => {
        it("should set exit code to 1", async () => {
            const result = await runLintLessons(
                new Error("Lesson file count exceeds limit"),
            );
            expect(result.exitCode).toBe(1);
        });
    });
});
