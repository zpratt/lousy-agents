/**
 * Gateway for reading lesson files from .lousy-agents/lessons/.
 */

import { lstat, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Lesson } from "../entities/lesson.js";
import { parseFrontmatterWithError } from "../lib/frontmatter.js";
import type {
    LessonFileGatewayPort,
    LessonReadError,
    ParsedLesson,
    ReadLessonsResult,
} from "../use-cases/lesson-file-gateway-port.js";
import { LessonFrontmatterSchema } from "../use-cases/lesson-schema.js";
import {
    assertPathHasNoSymbolicLinks,
    readFileNoFollow,
} from "./file-system-utils.js";

const MAX_LESSON_FILE_BYTES = 1_048_576; // 1 MB
const MAX_LESSON_FILES = 500;
const MAX_AGGREGATE_BYTES = 20 * 1024 * 1024; // 20 MB
const LESSONS_RELATIVE_PATH = join(".lousy-agents", "lessons");

/**
 * Extracts the markdown body from lesson file content (text after second `---`).
 */
function extractBody(content: string): string {
    const lines = content.split("\n");

    if (lines[0]?.trim() !== "---") {
        return content;
    }

    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trim() === "---") {
            endIndex = i;
            break;
        }
    }

    if (endIndex === -1) {
        return "";
    }

    const bodyLines = lines.slice(endIndex + 1);

    if (bodyLines[0] === "") {
        return bodyLines.slice(1).join("\n");
    }

    return bodyLines.join("\n");
}

export class LessonFileGateway implements LessonFileGatewayPort {
    async readLessons(rootDir: string): Promise<ReadLessonsResult> {
        const realRootDir = await realpath(rootDir);
        const lessonsDir = join(realRootDir, LESSONS_RELATIVE_PATH);

        await assertPathHasNoSymbolicLinks(realRootDir, lessonsDir);

        let dirStat: Awaited<ReturnType<typeof lstat>>;
        try {
            dirStat = await lstat(lessonsDir);
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                return { lessons: [], errors: [] };
            }
            throw error;
        }

        if (!dirStat.isDirectory()) {
            throw new Error(
                `Lessons path exists but is not a directory: ${lessonsDir}`,
            );
        }

        let entries: import("node:fs").Dirent[];
        try {
            entries = await readdir(lessonsDir, { withFileTypes: true });
        } catch (error: unknown) {
            const reason =
                error instanceof Error ? error.message : String(error);
            throw new Error(
                `Cannot read lessons directory ${lessonsDir}: ${reason}`,
            );
        }

        const mdFiles = entries
            .filter((e) => e.isFile() && e.name.endsWith(".md"))
            .map((e) => join(lessonsDir, e.name))
            .sort();

        if (mdFiles.length > MAX_LESSON_FILES) {
            throw new Error(
                `Lesson file count exceeds limit: ${mdFiles.length} files found (max ${MAX_LESSON_FILES})`,
            );
        }

        const lessons: ParsedLesson[] = [];
        const errors: LessonReadError[] = [];
        let aggregateBytes = 0;

        for (const filePath of mdFiles) {
            let content: string;
            try {
                content = await readFileNoFollow(
                    filePath,
                    MAX_LESSON_FILE_BYTES,
                );
            } catch (error: unknown) {
                const reason =
                    error instanceof Error ? error.message : String(error);
                errors.push({ filePath, reason });
                continue;
            }

            const byteLength = Buffer.byteLength(content, "utf-8");
            aggregateBytes += byteLength;

            if (aggregateBytes > MAX_AGGREGATE_BYTES) {
                throw new Error(
                    `Aggregate lesson bytes exceed limit: ${aggregateBytes} bytes > ${MAX_AGGREGATE_BYTES} bytes`,
                );
            }

            const parseResult = parseFrontmatterWithError(content);

            if (!parseResult.ok) {
                const reason =
                    parseResult.reason === "invalid"
                        ? `Invalid YAML frontmatter: ${parseResult.detail}`
                        : "Missing YAML frontmatter";
                errors.push({ filePath, reason });
                continue;
            }

            const schemaResult = LessonFrontmatterSchema.safeParse(
                parseResult.data.data,
            );

            if (!schemaResult.success) {
                const reason = schemaResult.error.issues
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("; ");
                errors.push({ filePath, reason });
                continue;
            }

            const fm = schemaResult.data;
            const body = extractBody(content);

            const lesson: Lesson = {
                slug: fm.slug,
                title: fm.title,
                type: fm.type,
                created: fm.created,
                revised: fm.revised,
                provenance: fm.provenance,
                triggers: {
                    paths: fm.triggers.paths,
                    tags: fm.triggers.tags,
                    patterns: fm.triggers.patterns,
                },
                body,
            };

            lessons.push({ lesson, filePath });
        }

        return { lessons, errors };
    }
}

export function createLessonFileGateway(): LessonFileGatewayPort {
    return new LessonFileGateway();
}
