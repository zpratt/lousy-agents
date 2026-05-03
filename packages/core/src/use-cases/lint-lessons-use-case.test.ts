import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { ReadLessonsResult } from "./lesson-file-gateway-port.js";
import { LintLessonsUseCase } from "./lint-lessons-use-case.js";

const chance = new Chance();

function makeGateway(result: ReadLessonsResult | Error) {
    return {
        readLessons: async (_rootDir: string): Promise<ReadLessonsResult> => {
            if (result instanceof Error) throw result;
            return result;
        },
    };
}

function makeLesson(slug: string) {
    return {
        lesson: {
            slug,
            title: chance.sentence({ words: 4 }),
            type: "invariant" as const,
            created: "2026-05-01",
            revised: "2026-05-01",
            provenance: [],
            triggers: { paths: [], tags: [], patterns: [] },
            body: chance.paragraph(),
        },
        filePath: `/lessons/${slug}.md`,
    };
}

describe("LintLessonsUseCase", () => {
    describe("when all lessons are valid", () => {
        it("should return valid: true", async () => {
            const slug = chance.pickone(["valid-slug", "another-slug"]);
            const gateway = makeGateway({
                lessons: [makeLesson(slug)],
                errors: [],
            });
            const useCase = new LintLessonsUseCase(gateway);

            const result = await useCase.execute({ rootDir: "/repo" });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.totalFiles).toBe(1);
        });
    });

    describe("when a lesson has an invalid type", () => {
        it("should return valid: false with error for that file", async () => {
            const filePath = `/lessons/${chance.word()}.md`;
            const reason = "type: Invalid enum value";
            const gateway = makeGateway({
                lessons: [],
                errors: [{ filePath, reason }],
            });
            const useCase = new LintLessonsUseCase(gateway);

            const result = await useCase.execute({ rootDir: "/repo" });

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.filePath).toBe(filePath);
        });
    });

    describe("when the directory does not exist", () => {
        it("should return valid: true with a no-lessons message", async () => {
            const gateway = makeGateway({ lessons: [], errors: [] });
            const useCase = new LintLessonsUseCase(gateway);

            const result = await useCase.execute({ rootDir: "/repo" });

            expect(result.valid).toBe(true);
            expect(result.totalFiles).toBe(0);
            expect(result.message).toContain("No lessons configured");
        });
    });

    describe("when the gateway throws (e.g., too many files, symlink)", () => {
        it("should return valid: false with the error reason", async () => {
            const errorMessage =
                "Lesson file count exceeds limit: 501 files found (max 500)";
            const gateway = makeGateway(new Error(errorMessage));
            const useCase = new LintLessonsUseCase(gateway);

            const result = await useCase.execute({ rootDir: "/repo" });

            expect(result.valid).toBe(false);
            expect(result.errors[0]?.reason).toContain(errorMessage);
        });
    });

    describe("when the gateway throws aggregate bytes exceeded", () => {
        it("should return valid: false with descriptive reason", async () => {
            const errorMessage = "Aggregate lesson bytes exceed limit";
            const gateway = makeGateway(new Error(errorMessage));
            const useCase = new LintLessonsUseCase(gateway);

            const result = await useCase.execute({ rootDir: "/repo" });

            expect(result.valid).toBe(false);
            expect(result.errors[0]?.reason).toContain(
                "Aggregate lesson bytes",
            );
        });
    });

    describe("when there are multiple lessons and some have errors", () => {
        it("should count both valid and errored files in totalFiles", async () => {
            const validSlug = chance.pickone(["slug-a", "slug-b"]);
            const errorPath = `/lessons/${chance.word()}.md`;
            const gateway = makeGateway({
                lessons: [makeLesson(validSlug)],
                errors: [
                    {
                        filePath: errorPath,
                        reason: "slug: slug must match ^[a-z0-9-]+$",
                    },
                ],
            });
            const useCase = new LintLessonsUseCase(gateway);

            const result = await useCase.execute({ rootDir: "/repo" });

            expect(result.valid).toBe(false);
            expect(result.totalFiles).toBe(2);
        });
    });
});
