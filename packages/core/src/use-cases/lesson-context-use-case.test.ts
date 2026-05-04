import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import { LessonContextUseCase } from "./lesson-context-use-case.js";
import type {
    LessonFileGatewayPort,
    ParsedLesson,
} from "./lesson-file-gateway-port.js";

const chance = new Chance();

function makeLesson(
    overrides: Partial<ParsedLesson["lesson"]> = {},
): ParsedLesson {
    const slug = chance
        .word({ length: 8 })
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
    return {
        filePath: `.lousy-agents/lessons/${slug}.md`,
        lesson: {
            slug,
            title: chance.sentence({ words: 4 }),
            type: "invariant",
            created: "2024-01-01",
            revised: "2024-01-01",
            provenance: [],
            triggers: {
                tags: [],
                paths: [],
                patterns: [],
            },
            body: chance.paragraph(),
            ...overrides,
        },
    };
}

function makeGateway(
    lessons: ParsedLesson[] = [],
    shouldThrow = false,
): LessonFileGatewayPort {
    return {
        readLessons: vi.fn().mockImplementation(async () => {
            if (shouldThrow) throw new Error("Gateway error");
            return { lessons, errors: [] };
        }),
    };
}

describe("LessonContextUseCase", () => {
    describe("given no lessons in the gateway", () => {
        it("returns empty additionalContext", async () => {
            const gateway = makeGateway([]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "SessionStart",
            });

            expect(result.additionalContext).toBe("");
            expect(result.truncatedCount).toBe(0);
        });
    });

    describe("given a lesson with no triggers on SessionStart", () => {
        it("includes invariant lessons regardless of empty triggers", async () => {
            const parsed = makeLesson({
                title: "Always Do X",
                type: "invariant",
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "SessionStart",
            });

            expect(result.additionalContext).toContain("## Always Do X");
        });
    });

    describe("given a lesson with no triggers on PreToolUse", () => {
        it("excludes the lesson because absence is not a wildcard", async () => {
            const parsed = makeLesson({
                title: "No Trigger Lesson",
                type: "invariant",
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/foo.ts"],
            });

            expect(result.additionalContext).not.toContain(
                "## No Trigger Lesson",
            );
        });
    });

    describe("given a pattern lesson on SessionStart", () => {
        it("excludes pattern-type lessons from SessionStart injection", async () => {
            const parsed = makeLesson({
                title: "Pattern Lesson",
                type: "pattern",
                triggers: { tags: [], paths: [], patterns: [] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "SessionStart",
            });

            expect(result.additionalContext).not.toContain("## Pattern Lesson");
        });
    });

    describe("given a lesson with a tag matching a path directory segment", () => {
        it("includes the lesson when a tag matches a forward-slash path segment", async () => {
            const parsed = makeLesson({
                title: "Src Lesson",
                triggers: { tags: ["src"], paths: [], patterns: [] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/rules.ts"],
            });

            expect(result.additionalContext).toContain("## Src Lesson");
        });
    });

    describe("given a lesson with a tag matching a file extension", () => {
        it("includes the lesson when a tag matches the file extension", async () => {
            const parsed = makeLesson({
                title: "TS Ext Lesson",
                triggers: { tags: ["ts"], paths: [], patterns: [] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/rules.ts"],
            });

            expect(result.additionalContext).toContain("## TS Ext Lesson");
        });
    });

    describe("given a lesson with a tag matching the full filename", () => {
        it("includes the lesson when a tag matches the full filename segment", async () => {
            const parsed = makeLesson({
                title: "Rules File Lesson",
                triggers: { tags: ["rules.ts"], paths: [], patterns: [] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/rules.ts"],
            });

            expect(result.additionalContext).toContain("## Rules File Lesson");
        });
    });

    describe("given a lesson with a tag that does not match any path segment or extension", () => {
        it("excludes the lesson when a tag is a tool name, not a path segment", async () => {
            const parsed = makeLesson({
                title: "Edit Tool Lesson",
                triggers: { tags: ["Edit"], paths: [], patterns: [] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/rules.ts"],
            });

            expect(result.additionalContext).not.toContain(
                "## Edit Tool Lesson",
            );
        });
    });

    describe("given a lesson with a tag trigger and a Windows-style backslash path", () => {
        it("includes the lesson after normalizing backslashes to forward slashes", async () => {
            const parsed = makeLesson({
                title: "Windows Path Lesson",
                triggers: { tags: ["src"], paths: [], patterns: [] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src\\rules.ts"],
            });

            expect(result.additionalContext).toContain(
                "## Windows Path Lesson",
            );
        });
    });

    describe("given a lesson with a path trigger matching a provided file path", () => {
        it("includes the lesson when a file path matches", async () => {
            const parsed = makeLesson({
                title: "TS Lesson",
                triggers: { tags: [], paths: ["**/*.ts"], patterns: [] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/foo.ts"],
            });

            expect(result.additionalContext).toContain("## TS Lesson");
        });
    });

    describe("given a lesson with a path trigger and a Windows-style backslash path", () => {
        it("includes the lesson after normalizing backslashes to forward slashes for picomatch", async () => {
            const parsed = makeLesson({
                title: "Windows Glob Lesson",
                triggers: { tags: [], paths: ["**/*.ts"], patterns: [] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src\\rules.ts"],
            });

            expect(result.additionalContext).toContain(
                "## Windows Glob Lesson",
            );
        });
    });

    describe("given a lesson with a path trigger that does not match the provided file paths", () => {
        it("excludes the lesson", async () => {
            const parsed = makeLesson({
                title: "TS Lesson",
                triggers: { tags: [], paths: ["**/*.ts"], patterns: [] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/foo.py"],
            });

            expect(result.additionalContext).not.toContain("## TS Lesson");
        });
    });

    describe("given a lesson with a content pattern trigger", () => {
        it("includes the lesson when file content contains the pattern", async () => {
            const pattern = "useSomeSpecificHook";
            const parsed = makeLesson({
                title: "Hook Lesson",
                triggers: { tags: [], paths: [], patterns: [pattern] },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const fileContents = new Map([
                ["src/component.tsx", `import { ${pattern} } from './hooks';`],
            ]);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/component.tsx"],
                fileContents,
            });

            expect(result.additionalContext).toContain("## Hook Lesson");
        });
    });

    describe("given a lesson with a content pattern trigger that does not match", () => {
        it("excludes the lesson when file content does not contain the pattern", async () => {
            const parsed = makeLesson({
                title: "Hook Lesson",
                triggers: {
                    tags: [],
                    paths: [],
                    patterns: ["useSomeSpecificHook"],
                },
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const fileContents = new Map([
                ["src/component.tsx", "no match here"],
            ]);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/component.tsx"],
                fileContents,
            });

            expect(result.additionalContext).not.toContain("## Hook Lesson");
        });
    });

    describe("given a body longer than 2000 characters", () => {
        it("truncates the lesson body to 2000 characters", async () => {
            const longBody = "x".repeat(2500);
            const parsed = makeLesson({
                title: "Long Body",
                body: longBody,
                type: "invariant",
            });
            const gateway = makeGateway([parsed]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "SessionStart",
            });

            const rendered = result.additionalContext;
            expect(rendered).toContain("## Long Body");
            // body section should be truncated
            const bodyPart = rendered.replace("## Long Body\n\n", "");
            expect(bodyPart).toHaveLength(2000);
        });
    });

    describe("given multiple lessons exceeding the 9800-character aggregate cap", () => {
        it("truncates lessons beyond the cap and appends a truncation note", async () => {
            // Create 6 invariant lessons each rendering to ~2000 chars (heading + body)
            const lessons = Array.from({ length: 6 }, (_, i) =>
                makeLesson({
                    title: `Lesson ${i}`,
                    body: "y".repeat(1950),
                    type: "invariant",
                }),
            );
            const gateway = makeGateway(lessons);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "SessionStart",
            });

            expect(result.truncatedCount).toBeGreaterThan(0);
            expect(result.additionalContext).toContain(
                "truncated due to length cap",
            );
            // The assembled context must not exceed the cap + footer length
            expect(result.additionalContext.length).toBeLessThanOrEqual(
                9800 + 200,
            );
        });
    });

    describe("given the gateway throws an error", () => {
        it("returns empty additionalContext and surfaces the thrown error in gatewayErrors (fail-open)", async () => {
            const gateway = makeGateway([], true);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "SessionStart",
            });

            expect(result.additionalContext).toBe("");
            expect(result.truncatedCount).toBe(0);
            expect(result.gatewayErrors).toHaveLength(1);
            expect(result.gatewayErrors[0].filePath).toBe("/repo");
            expect(result.gatewayErrors[0].reason).toBeTruthy();
        });
    });

    describe("given the gateway returns file read errors", () => {
        it("surfaces the errors in gatewayErrors", async () => {
            const errFilePath = ".lousy-agents/lessons/bad.md";
            const errReason = "Invalid YAML frontmatter: unexpected token";
            const gateway: LessonFileGatewayPort = {
                readLessons: vi.fn().mockResolvedValue({
                    lessons: [],
                    errors: [{ filePath: errFilePath, reason: errReason }],
                }),
            };
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "SessionStart",
            });

            expect(result.gatewayErrors).toHaveLength(1);
            expect(result.gatewayErrors[0]).toEqual({
                filePath: errFilePath,
                reason: errReason,
            });
        });
    });

    describe("given two matched lessons with the same slug", () => {
        it("includes the lesson only once (dedup by slug)", async () => {
            const slug = "duplicate-slug";
            const lesson1 = makeLesson({
                slug,
                title: "First Duplicate",
                type: "invariant",
            });
            const lesson2 = makeLesson({
                slug,
                title: "Second Duplicate",
                type: "invariant",
            });
            const gateway = makeGateway([lesson1, lesson2]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "SessionStart",
            });

            const occurrences = (
                result.additionalContext.match(/## First Duplicate/g) ?? []
            ).length;
            expect(occurrences).toBe(1);
            expect(result.additionalContext).not.toContain(
                "## Second Duplicate",
            );
        });
    });

    describe("given matched lessons of mixed types", () => {
        it("sorts invariant before pattern (type ascending)", async () => {
            const patternLesson = makeLesson({
                title: "Pattern Type Lesson",
                type: "pattern",
                triggers: { tags: [], paths: ["**/*.ts"], patterns: [] },
            });
            const invariantLesson = makeLesson({
                title: "Invariant Type Lesson",
                type: "invariant",
                triggers: { tags: [], paths: ["**/*.ts"], patterns: [] },
            });
            const gateway = makeGateway([patternLesson, invariantLesson]);
            const useCase = new LessonContextUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                hookEventName: "PreToolUse",
                filePaths: ["src/foo.ts"],
            });

            const invariantPos = result.additionalContext.indexOf(
                "## Invariant Type Lesson",
            );
            const patternPos = result.additionalContext.indexOf(
                "## Pattern Type Lesson",
            );
            expect(invariantPos).toBeGreaterThanOrEqual(0);
            expect(patternPos).toBeGreaterThanOrEqual(0);
            expect(invariantPos).toBeLessThan(patternPos);
        });
    });
});
