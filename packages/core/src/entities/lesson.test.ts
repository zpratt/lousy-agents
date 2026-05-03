import { describe, expect, it } from "vitest";
import type {
    Lesson,
    LessonProvenance,
    LessonTriggers,
    LessonType,
} from "./lesson.js";

describe("Lesson entity types", () => {
    it("should compile a valid invariant lesson", () => {
        const lesson: Lesson = {
            slug: "fail-closed-default",
            title: "Use fail-closed defaults for policy decisions",
            type: "invariant",
            created: "2026-05-02",
            revised: "2026-05-02",
            provenance: [],
            triggers: {
                paths: ["src/policy/**"],
                tags: ["policy"],
                patterns: ["fail-closed"],
            },
            body: "Always default to deny.",
        };

        expect(lesson.type).toBe("invariant");
        expect(lesson.slug).toBe("fail-closed-default");
    });

    it("should compile a valid pattern lesson", () => {
        const lesson: Lesson = {
            slug: "zod-external-validation",
            title: "Validate external data with Zod",
            type: "pattern",
            created: "2026-05-01",
            revised: "2026-05-02",
            provenance: [
                {
                    pr: 42,
                    // biome-ignore lint/style/useNamingConvention: YAML frontmatter key uses snake_case
                    finding_id: "f-2026-05-01-001",
                    facet: "runtime type safety",
                },
            ],
            triggers: {
                paths: [],
                tags: ["ts"],
                patterns: ["as Type"],
            },
            body: "Use Zod.parse() on all external inputs.",
        };

        expect(lesson.type).toBe("pattern");
        expect(lesson.provenance).toHaveLength(1);
    });

    it("should accept LessonType union values", () => {
        const invariant: LessonType = "invariant";
        const pattern: LessonType = "pattern";

        expect(invariant).toBe("invariant");
        expect(pattern).toBe("pattern");
    });

    it("should accept LessonTriggers with empty arrays", () => {
        const triggers: LessonTriggers = {
            paths: [],
            tags: [],
            patterns: [],
        };

        expect(triggers.paths).toHaveLength(0);
    });

    it("should accept LessonProvenance with required fields", () => {
        const provenance: LessonProvenance = {
            pr: 100,
            // biome-ignore lint/style/useNamingConvention: YAML frontmatter key uses snake_case
            finding_id: "f-2026-05-02-001",
            facet: "some facet",
        };

        expect(provenance.pr).toBe(100);
    });
});
