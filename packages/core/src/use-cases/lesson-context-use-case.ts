import picomatch from "picomatch";
import type { Lesson } from "../entities/lesson.js";
import type {
    LessonFileGatewayPort,
    ParsedLesson,
} from "./lesson-file-gateway-port.js";

const PICOMATCH_OPTIONS: picomatch.PicomatchOptions = {
    dot: false,
    nocase: false,
};

const BODY_TRUNCATE_CHARS = 2000;
const AGGREGATE_TRUNCATE_CHARS = 9800;

export interface LessonContextInput {
    rootDir: string;
    hookEventName: "PreToolUse" | "SessionStart";
    filePaths?: readonly string[];
    /** Optional map of filePath → content for content-pattern matching */
    fileContents?: ReadonlyMap<string, string>;
}

export interface LessonContextOutput {
    additionalContext: string;
    truncatedCount: number;
    gatewayErrors: readonly { filePath: string; reason: string }[];
}

/**
 * Extracts all matchable tokens from a list of file paths:
 * - Each forward-slash-separated path segment
 * - The file extension (without the dot) for segments containing a dot
 */
function extractPathSegments(filePaths: readonly string[]): Set<string> {
    const segments = new Set<string>();
    for (const fp of filePaths) {
        const normalized = fp.replace(/\\/g, "/");
        for (const part of normalized.split("/").filter(Boolean)) {
            segments.add(part);
            const dotIndex = part.lastIndexOf(".");
            if (dotIndex > 0) {
                segments.add(part.slice(dotIndex + 1));
            }
        }
    }
    return segments;
}

/**
 * Returns true when the lesson's triggers match the given context.
 *
 * Matching rules for PreToolUse:
 * - If ALL three trigger arrays are empty, the lesson does NOT match (absence
 *   is not a wildcard; lessons must opt-in to triggers).
 * - A lesson matches if ANY of the following hold:
 *   1. tags: any tag matches a forward-slash path segment or file extension
 *   2. paths: at least one filePath matches the precompiled picomatch glob (globMatcher)
 *   3. patterns: at least one filePath's content contains a pattern literal
 *
 * `segments`, `normalizedPaths`, and `globMatcher` are precomputed once per
 * `execute()` call (not per-lesson) to avoid redundant work on the hot path.
 */
function matchesLesson(
    lesson: Lesson,
    filePaths: readonly string[],
    fileContents: ReadonlyMap<string, string>,
    segments: ReadonlySet<string>,
    normalizedPaths: readonly string[],
    globMatcher: picomatch.Matcher | null,
): boolean {
    const { tags, paths, patterns } = lesson.triggers;

    // No triggers → does not fire on PreToolUse
    if (tags.length === 0 && paths.length === 0 && patterns.length === 0) {
        return false;
    }

    // Tag match: tags match path segments and file extensions, not tool names
    if (filePaths.length > 0 && tags.length > 0) {
        if (tags.some((tag) => segments.has(tag))) {
            return true;
        }
    }

    // Path glob match — normalized paths already use forward slashes
    if (filePaths.length > 0 && paths.length > 0 && globMatcher !== null) {
        if (normalizedPaths.some((p) => globMatcher(p))) {
            return true;
        }
    }

    // Content pattern match (literal substring)
    if (filePaths.length > 0 && patterns.length > 0) {
        for (const fp of filePaths) {
            const content = fileContents.get(fp);
            if (content === undefined) continue;
            for (const pat of patterns) {
                if (content.includes(pat)) {
                    return true;
                }
            }
        }
    }

    return false;
}

function renderLesson(parsed: ParsedLesson): string {
    const lesson = parsed.lesson;
    const heading = `## ${lesson.title}`;
    const truncatedBody =
        lesson.body.length > BODY_TRUNCATE_CHARS
            ? lesson.body.slice(0, BODY_TRUNCATE_CHARS)
            : lesson.body;
    return `${heading}\n\n${truncatedBody}`;
}

export class LessonContextUseCase {
    constructor(private readonly gateway: LessonFileGatewayPort) {}

    async execute(input: LessonContextInput): Promise<LessonContextOutput> {
        const {
            rootDir,
            hookEventName,
            filePaths = [],
            fileContents = new Map<string, string>(),
        } = input;

        let result: Awaited<ReturnType<typeof this.gateway.readLessons>>;
        try {
            result = await this.gateway.readLessons(rootDir);
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : String(error);
            return {
                additionalContext: "",
                truncatedCount: 0,
                gatewayErrors: [{ filePath: rootDir, reason }],
            };
        }

        let matched: readonly ParsedLesson[];
        if (hookEventName === "SessionStart") {
            // SessionStart injects all invariant lessons regardless of triggers
            matched = result.lessons.filter(
                (p) => p.lesson.type === "invariant",
            );
        } else {
            // Precompute once per execute() call (not per-lesson) for efficiency
            const segments = extractPathSegments(filePaths);
            const normalizedPaths = filePaths.map((p) => p.replace(/\\/g, "/"));
            // Precompile glob matchers per-lesson-position (not keyed by slug —
            // two lessons may share a slug while carrying different triggers.paths,
            // and a slug-keyed Map would silently overwrite the first matcher with
            // the second, causing incorrect matching).
            const globMatchers = result.lessons.map((p) => {
                const { paths } = p.lesson.triggers;
                return paths.length > 0
                    ? picomatch(paths, PICOMATCH_OPTIONS)
                    : null;
            });
            matched = result.lessons.filter((p, i) =>
                matchesLesson(
                    p.lesson,
                    filePaths,
                    fileContents,
                    segments,
                    normalizedPaths,
                    globMatchers[i] ?? null,
                ),
            );
        }

        let assembled = "";
        let truncatedCount = 0;

        // Dedup by slug (keep first occurrence), then sort: type asc, then slug asc
        const seenSlugs = new Set<string>();
        const deduped = matched.filter((p) => {
            if (seenSlugs.has(p.lesson.slug)) return false;
            seenSlugs.add(p.lesson.slug);
            return true;
        });
        const sorted = [...deduped].sort((a, b) => {
            const typeOrder = a.lesson.type.localeCompare(b.lesson.type);
            if (typeOrder !== 0) return typeOrder;
            return a.lesson.slug.localeCompare(b.lesson.slug);
        });

        for (const parsed of sorted) {
            const rendered = renderLesson(parsed);
            const separator = assembled.length > 0 ? "\n\n" : "";
            const candidate = assembled + separator + rendered;
            if (candidate.length > AGGREGATE_TRUNCATE_CHARS) {
                truncatedCount++;
            } else {
                assembled = candidate;
            }
        }

        let additionalContext = assembled;

        if (truncatedCount > 0) {
            const note = `\n\n_(${truncatedCount} additional lesson${truncatedCount === 1 ? "" : "s"} truncated due to length cap)_`;
            // Trim assembled to ensure the full string (assembled + note) stays
            // within the cap — the loop above only enforces the cap for lesson
            // bodies, not for the footer appended here.
            const trimmedAssembled =
                assembled.length + note.length > AGGREGATE_TRUNCATE_CHARS
                    ? assembled.slice(0, AGGREGATE_TRUNCATE_CHARS - note.length)
                    : assembled;
            additionalContext = trimmedAssembled + note;
        }

        return {
            additionalContext,
            truncatedCount,
            gatewayErrors: result.errors,
        };
    }
}
