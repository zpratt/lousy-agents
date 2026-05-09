export type LessonType = "invariant" | "pattern";

export interface LessonTriggers {
    readonly paths: readonly string[];
    readonly tags: readonly string[];
    readonly patterns: readonly string[];
}

export interface LessonProvenance {
    readonly pr: number;
    // biome-ignore lint/style/useNamingConvention: matches YAML frontmatter key verbatim
    readonly finding_id: string;
    readonly facet: string;
}

export interface Lesson {
    readonly slug: string;
    readonly title: string;
    readonly type: LessonType;
    readonly created: string;
    readonly revised: string;
    readonly provenance: readonly LessonProvenance[];
    readonly triggers: LessonTriggers;
    readonly body: string;
}
