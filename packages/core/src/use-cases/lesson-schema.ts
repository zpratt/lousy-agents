import { z } from "zod";

const SAFE_SLUG = /^[a-z0-9-]+$/;
const MAX_PATTERN_LENGTH = 200;
const MAX_PATTERNS = 50;
const MAX_TRIGGER_VALUES = 100;
const MAX_TRIGGER_VALUE_LENGTH = 200;

export const LessonFrontmatterSchema = z
    .object({
        slug: z.string().regex(SAFE_SLUG, "slug must match ^[a-z0-9-]+$"),
        title: z.string().min(1),
        type: z.enum(["invariant", "pattern"]),
        created: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "created must be YYYY-MM-DD"),
        revised: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "revised must be YYYY-MM-DD"),
        provenance: z.array(
            z
                .object({
                    pr: z.number().int(),
                    // biome-ignore lint/style/useNamingConvention: YAML frontmatter key uses snake_case
                    finding_id: z.string(),
                    facet: z.string(),
                })
                .strict(),
        ),
        triggers: z
            .object({
                paths: z
                    .array(z.string().min(1).max(MAX_TRIGGER_VALUE_LENGTH))
                    .max(MAX_TRIGGER_VALUES),
                tags: z
                    .array(z.string().min(1).max(MAX_TRIGGER_VALUE_LENGTH))
                    .max(MAX_TRIGGER_VALUES),
                patterns: z
                    .array(z.string().min(1).max(MAX_PATTERN_LENGTH))
                    .max(MAX_PATTERNS),
            })
            .strict(),
    })
    .strict()
    .refine((data) => data.revised >= data.created, {
        message:
            "revised must be on or after created (lexicographic ISO date compare)",
        path: ["revised"],
    });

export type LessonFrontmatter = z.infer<typeof LessonFrontmatterSchema>;
