import Chance from "chance";
import { describe, expect, it } from "vitest";
import { LessonFrontmatterSchema } from "./lesson-schema.js";

const chance = new Chance();

function validFrontmatter() {
    return {
        slug: "valid-slug",
        title: "A valid lesson title",
        type: "invariant" as const,
        created: "2026-05-01",
        revised: "2026-05-01",
        provenance: [],
        triggers: {
            paths: ["src/**"],
            tags: ["ts"],
            patterns: ["some-pattern"],
        },
    };
}

describe("LessonFrontmatterSchema", () => {
    describe("when given a valid invariant lesson", () => {
        it("should parse successfully", () => {
            const result = LessonFrontmatterSchema.safeParse(
                validFrontmatter(),
            );
            expect(result.success).toBe(true);
        });
    });

    describe("when given a valid pattern lesson", () => {
        it("should parse successfully", () => {
            const data = { ...validFrontmatter(), type: "pattern" as const };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(true);
        });
    });

    describe("when given an invalid type", () => {
        it("should reject with an error", () => {
            const data = { ...validFrontmatter(), type: "unknown" };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const messages = result.error.issues.map((i) => i.message);
                expect(messages.join(" ")).toMatch(
                    /invalid_enum_value|Invalid enum value|Invalid option/i,
                );
            }
        });
    });

    describe("when given a slug containing '/'", () => {
        it("should reject with a slug format error", () => {
            const data = { ...validFrontmatter(), slug: "bad/slug" };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const messages = result.error.issues.map((i) => i.message);
                expect(messages.join(" ")).toContain("^[a-z0-9-]+$");
            }
        });
    });

    describe("when given a slug containing '..'", () => {
        it("should reject with a slug format error", () => {
            const data = { ...validFrontmatter(), slug: "bad..slug" };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const messages = result.error.issues.map((i) => i.message);
                expect(messages.join(" ")).toContain("^[a-z0-9-]+$");
            }
        });
    });

    describe("when a pattern exceeds 200 characters", () => {
        it("should reject the pattern", () => {
            const longPattern = chance.string({
                length: 201,
                pool: "abcdefghijklmnopqrstuvwxyz",
            });
            const data = {
                ...validFrontmatter(),
                triggers: {
                    ...validFrontmatter().triggers,
                    patterns: [longPattern],
                },
            };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
        });
    });

    describe("when there are too many patterns (> 50)", () => {
        it("should reject the patterns array", () => {
            const patterns = Array.from(
                { length: 51 },
                (_, i) => `pattern-${i}`,
            );
            const data = {
                ...validFrontmatter(),
                triggers: { ...validFrontmatter().triggers, patterns },
            };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
        });
    });

    describe("when trigger paths exceed 100 entries", () => {
        it("should reject the paths array", () => {
            const paths = Array.from(
                { length: 101 },
                (_, i) => `src/path-${i}/**`,
            );
            const data = {
                ...validFrontmatter(),
                triggers: { ...validFrontmatter().triggers, paths },
            };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
        });
    });

    describe("when trigger tags exceed 100 entries", () => {
        it("should reject the tags array", () => {
            const tags = Array.from({ length: 101 }, (_, i) => `tag-${i}`);
            const data = {
                ...validFrontmatter(),
                triggers: { ...validFrontmatter().triggers, tags },
            };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
        });
    });

    describe("when a trigger path string exceeds 200 characters", () => {
        it("should reject the path string", () => {
            const longPath = `src/${"a".repeat(201)}/**`;
            const data = {
                ...validFrontmatter(),
                triggers: { ...validFrontmatter().triggers, paths: [longPath] },
            };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
        });
    });

    describe("when a trigger tag string exceeds 200 characters", () => {
        it("should reject the tag string", () => {
            const longTag = "a".repeat(201);
            const data = {
                ...validFrontmatter(),
                triggers: { ...validFrontmatter().triggers, tags: [longTag] },
            };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
        });
    });

    describe("when required fields are missing", () => {
        it("should reject with errors naming the missing fields", () => {
            const result = LessonFrontmatterSchema.safeParse({});
            expect(result.success).toBe(false);
            if (!result.success) {
                const paths = result.error.issues.map((i) => i.path.join("."));
                expect(paths).toContain("slug");
                expect(paths).toContain("title");
            }
        });
    });

    describe("when revised is earlier than created", () => {
        it("should reject with a date order error", () => {
            const data = {
                ...validFrontmatter(),
                created: "2026-05-02",
                revised: "2026-05-01",
            };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const messages = result.error.issues.map((i) => i.message);
                expect(messages.join(" ")).toContain(
                    "revised must be on or after",
                );
            }
        });
    });

    describe("when revised equals created (same-day authoring)", () => {
        it("should accept the lesson", () => {
            const data = {
                ...validFrontmatter(),
                created: "2026-05-02",
                revised: "2026-05-02",
            };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(true);
        });
    });

    describe("when provenance is an empty array", () => {
        it("should accept the lesson (in-session captures pre-PR)", () => {
            const data = { ...validFrontmatter(), provenance: [] };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(true);
        });
    });

    describe("when provenance has valid entries", () => {
        it("should accept the lesson", () => {
            const pr = chance.integer({ min: 1, max: 9999 });
            const data = {
                ...validFrontmatter(),
                provenance: [
                    {
                        pr,
                        // biome-ignore lint/style/useNamingConvention: YAML frontmatter key uses snake_case
                        finding_id: "f-2026-05-01-001",
                        facet: "some facet",
                    },
                ],
            };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(true);
        });
    });

    describe("when given a title with exactly 200 characters", () => {
        it("should accept the lesson", () => {
            const data = { ...validFrontmatter(), title: "a".repeat(200) };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(true);
        });
    });

    describe("when given a title exceeding 200 characters", () => {
        it("should reject with a validation error", () => {
            const data = { ...validFrontmatter(), title: "a".repeat(201) };
            const result = LessonFrontmatterSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const paths = result.error.issues.map((i) => i.path.join("."));
                expect(paths).toContain("title");
            }
        });
    });
});
