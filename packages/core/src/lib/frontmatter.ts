/**
 * Shared YAML frontmatter parser for markdown files.
 * Extracts YAML data between leading `---` delimiters.
 */

import { parse as parseYaml } from "yaml";
import type { ParsedFrontmatter } from "../entities/skill.js";

export type FrontmatterParseResult =
    | { ok: true; data: ParsedFrontmatter }
    | { ok: false; reason: "missing" }
    | { ok: false; reason: "invalid"; detail: string };

/**
 * Parses YAML frontmatter and returns a tagged result:
 * - `{ ok: true, data }` on success
 * - `{ ok: false, reason: 'missing' }` when no frontmatter delimiters found
 * - `{ ok: false, reason: 'invalid', detail }` when YAML is malformed (with error detail)
 */
export function parseFrontmatterWithError(
    content: string,
): FrontmatterParseResult {
    const lines = content.split("\n");

    if (lines[0]?.trim() !== "---") {
        return { ok: false, reason: "missing" };
    }

    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trim() === "---") {
            endIndex = i;
            break;
        }
    }

    if (endIndex === -1) {
        return { ok: false, reason: "missing" };
    }

    const yamlContent = lines.slice(1, endIndex).join("\n");

    let data: Record<string, unknown>;
    try {
        const parsed: unknown = parseYaml(yamlContent, { maxAliasCount: 0 });
        data =
            parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
    } catch (error: unknown) {
        const detail =
            error instanceof Error ? error.message : "Unknown YAML parse error";
        return { ok: false, reason: "invalid", detail };
    }

    const fieldLines = new Map<string, number>();
    for (let i = 1; i < endIndex; i++) {
        const match = lines[i]?.match(/^([^\s:][^:]*?):(?:\s|$)/);
        if (match?.[1]) {
            fieldLines.set(match[1], i + 1);
        }
    }

    return {
        ok: true,
        data: {
            data: data ?? {},
            fieldLines,
            frontmatterStartLine: 1,
        },
    };
}

/**
 * Parses YAML frontmatter from markdown content.
 *
 * Returns `null` when the content has no opening `---`, no closing `---`,
 * or contains invalid YAML.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter | null {
    const lines = content.split("\n");

    if (lines[0]?.trim() !== "---") {
        return null;
    }

    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trim() === "---") {
            endIndex = i;
            break;
        }
    }

    if (endIndex === -1) {
        return null;
    }

    const yamlContent = lines.slice(1, endIndex).join("\n");

    let data: Record<string, unknown>;
    try {
        const parsed: unknown = parseYaml(yamlContent, { maxAliasCount: 0 });
        data =
            parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
    } catch {
        return null;
    }

    const fieldLines = new Map<string, number>();
    for (let i = 1; i < endIndex; i++) {
        // Match YAML top-level field names: non-whitespace start, any chars except colon, then colon followed by whitespace or end-of-line
        const match = lines[i]?.match(/^([^\s:][^:]*?):(?:\s|$)/);
        if (match?.[1]) {
            fieldLines.set(match[1], i + 1);
        }
    }

    return {
        data: data ?? {},
        fieldLines,
        frontmatterStartLine: 1,
    };
}
