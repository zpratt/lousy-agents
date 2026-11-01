import { findImportTokens } from "@lousy-agents/core/lib/instruction-import-expand.js";
import { parse as parseYaml } from "yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const MARKDOWN_LINK_RE = /\[(?:[^\]]*)\]\(([^)]+)\)/g;
const SOFT_REF_FRONTMATTER_KEYS = ["see", "references", "requires"] as const;

interface ParsedFrontmatter {
    applyTo?: string | string[];
    see?: string | string[];
    references?: string | string[];
    requires?: string | string[];
    [key: string]: unknown;
}

function parseFrontmatter(content: string): ParsedFrontmatter | null {
    const match = FRONTMATTER_RE.exec(content);
    if (!match) return null;
    try {
        const parsed = parseYaml(match[1]);
        return typeof parsed === "object" && parsed !== null
            ? (parsed as ParsedFrontmatter)
            : null;
    } catch {
        return null;
    }
}

function contentWithoutFrontmatter(content: string): string {
    return content.replace(FRONTMATTER_RE, "");
}

function toStringArray(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value))
        return value.filter((v): v is string => typeof v === "string");
    return [];
}

function isInstructionFilePath(path: string): boolean {
    return (
        path.endsWith(".md") ||
        path.endsWith(".instructions.md") ||
        path.endsWith(".mdc")
    );
}

export interface RawEdge {
    type: "hard-import" | "soft-reference" | "glob-binding";
    rawTarget: string;
}

function isExternalUrl(href: string): boolean {
    return href.startsWith("http://") || href.startsWith("https://");
}

/** Frontmatter values are optional; a falsy value declares nothing. */
function declaredStrings(value: unknown): string[] {
    return value ? toStringArray(value) : [];
}

function frontmatterEdges(fm: ParsedFrontmatter): RawEdge[] {
    const globBindings = declaredStrings(fm.applyTo).map(
        (glob): RawEdge => ({ type: "glob-binding", rawTarget: glob }),
    );
    const softReferences = SOFT_REF_FRONTMATTER_KEYS.flatMap((key) =>
        declaredStrings(fm[key])
            .filter(isInstructionFilePath)
            .map(
                (ref): RawEdge => ({ type: "soft-reference", rawTarget: ref }),
            ),
    );

    return [...globBindings, ...softReferences];
}

// Hard imports use the core tokenizer so doctor and import expansion
// agree on which `@path` lines are imports (e.g., code is ignored).
function hardImportEdges(body: string): RawEdge[] {
    return findImportTokens(body).map(
        (token): RawEdge => ({
            type: "hard-import",
            rawTarget: token.rawTarget,
        }),
    );
}

function markdownLinkEdges(body: string): RawEdge[] {
    return Array.from(body.matchAll(MARKDOWN_LINK_RE), (match) => match[1])
        .filter((href) => !isExternalUrl(href) && isInstructionFilePath(href))
        .map((href): RawEdge => ({ type: "soft-reference", rawTarget: href }));
}

export function parseRawEdges(content: string): RawEdge[] {
    const fm = parseFrontmatter(content);
    const body = fm ? contentWithoutFrontmatter(content) : content;

    return [
        ...(fm ? frontmatterEdges(fm) : []),
        ...hardImportEdges(body),
        ...markdownLinkEdges(body),
    ];
}
