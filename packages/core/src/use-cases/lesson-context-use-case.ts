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
    toolName?: string;
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
 * Returns true when the lesson's triggers match the given context.
 *
 * Matching rules for PreToolUse:
 * - If ALL three trigger arrays are empty, the lesson does NOT match (absence
 *   is not a wildcard; lessons must opt-in to triggers).
 * - A lesson matches if ANY of the following hold:
 *   1. tags: toolName is contained in lesson.triggers.tags
 *   2. paths: at least one filePath matches a picomatch glob in lesson.triggers.paths
 *   3. patterns: at least one filePath's content contains a pattern literal
 */
function matchesLesson(
    lesson: Lesson,
    toolName: string | undefined,
    filePaths: readonly string[],
    fileContents: ReadonlyMap<string, string>,
): boolean {
    const { tags, paths, patterns } = lesson.triggers;

    // No triggers → does not fire on PreToolUse
    if (tags.length === 0 && paths.length === 0 && patterns.length === 0) {
        return false;
    }

    // Tag match
    if (toolName !== undefined && tags.length > 0 && tags.includes(toolName)) {
        return true;
    }

    // Path glob match
    if (filePaths.length > 0 && paths.length > 0) {
        const isMatch = picomatch(paths, PICOMATCH_OPTIONS);
        if (filePaths.some((p) => isMatch(p))) {
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
            toolName,
            filePaths = [],
            fileContents = new Map(),
        } = input;

        let result: Awaited<ReturnType<typeof this.gateway.readLessons>>;
        try {
            result = await this.gateway.readLessons(rootDir);
        } catch {
            return {
                additionalContext: "",
                truncatedCount: 0,
                gatewayErrors: [],
            };
        }

        let matched: readonly ParsedLesson[];
        if (hookEventName === "SessionStart") {
            // SessionStart injects all invariant lessons regardless of triggers
            matched = result.lessons.filter(
                (p) => p.lesson.type === "invariant",
            );
        } else {
            matched = result.lessons.filter((p) =>
                matchesLesson(p.lesson, toolName, filePaths, fileContents),
            );
        }

        let assembled = "";
        let truncatedCount = 0;

        for (const parsed of matched) {
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
            additionalContext += note;
        }

        return {
            additionalContext,
            truncatedCount,
            gatewayErrors: result.errors,
        };
    }
}
