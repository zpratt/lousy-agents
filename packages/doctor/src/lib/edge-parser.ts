import { parse as parseYaml } from "yaml";

const HARD_IMPORT_GLOBAL_RE = /^@([^\s@][^\s]*)/gm;
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

export function parseRawEdges(content: string): RawEdge[] {
    const edges: RawEdge[] = [];
    const fm = parseFrontmatter(content);

    if (fm) {
        if (fm.applyTo) {
            for (const glob of toStringArray(fm.applyTo)) {
                edges.push({ type: "glob-binding", rawTarget: glob });
            }
        }

        for (const key of SOFT_REF_FRONTMATTER_KEYS) {
            const value = fm[key];
            if (value) {
                for (const ref of toStringArray(value)) {
                    if (isInstructionFilePath(ref)) {
                        edges.push({ type: "soft-reference", rawTarget: ref });
                    }
                }
            }
        }
    }

    const body = fm ? contentWithoutFrontmatter(content) : content;

    for (const match of body.matchAll(HARD_IMPORT_GLOBAL_RE)) {
        const target = match[1];
        if (target.includes("/")) {
            edges.push({ type: "hard-import", rawTarget: target });
        }
    }

    for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
        const href = match[1];
        if (
            !href.startsWith("http://") &&
            !href.startsWith("https://") &&
            isInstructionFilePath(href)
        ) {
            edges.push({ type: "soft-reference", rawTarget: href });
        }
    }

    return edges;
}
