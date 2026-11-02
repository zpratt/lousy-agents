import { findImportTokens } from "@lousy-agents/core/lib/instruction-import-expand.js";
import { parse as parseYaml } from "yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
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
    /**
     * Set on an `@` token that is not clearly a path (`@types/node`): it is an
     * edge only if it resolves to a file, and a miss is not reported.
     */
    speculative?: true;
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
            ...(token.looksLikePath ? {} : { speculative: true as const }),
        }),
    );
}

/**
 * The targets of the `[text](target)` links in a body, in order: an opening
 * bracket, the text up to the first closing bracket after it, an opening
 * parenthesis right behind that bracket, and a non-empty target up to the
 * first closing parenthesis. One pass: every opening bracket before the same
 * closing bracket gets the same answer, so a failed attempt skips to the
 * first opening bracket after that closing bracket, and a missing closer
 * ends the scan, since nothing after it can match either.
 */
function markdownLinkTargets(body: string): string[] {
    const targets: string[] = [];
    let open = body.indexOf("[");
    while (open !== -1) {
        const attempt = attemptLinkAt(body, open);
        if (attempt.done) {
            break;
        }
        if (attempt.target !== undefined) {
            targets.push(attempt.target);
        }
        open = attempt.next;
    }
    return targets;
}

/**
 * What one attempt at a link found: the end of the scan, or the target when
 * there was one, and where the next attempt starts.
 */
type LinkAttempt =
    | { readonly done: true }
    | {
          readonly done: false;
          readonly target?: string;
          readonly next: number;
      };

function attemptLinkAt(body: string, open: number): LinkAttempt {
    const close = body.indexOf("]", open + 1);
    if (close === -1) {
        return { done: true };
    }
    if (body[close + 1] !== "(") {
        return { done: false, next: body.indexOf("[", close + 1) };
    }
    const end = body.indexOf(")", close + 2);
    if (end === -1) {
        return { done: true };
    }
    if (end > close + 2) {
        return {
            done: false,
            target: body.slice(close + 2, end),
            next: body.indexOf("[", end + 1),
        };
    }
    return { done: false, next: body.indexOf("[", close + 1) };
}

function markdownLinkEdges(body: string): RawEdge[] {
    return markdownLinkTargets(body)
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
