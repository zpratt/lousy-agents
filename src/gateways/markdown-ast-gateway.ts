/**
 * Gateway for parsing Markdown files into AST using remark.
 * Extracts structural features like headings, code blocks, and paragraphs.
 */

import { readFile } from "node:fs/promises";
import type { Code, Heading, InlineCode, Paragraph, Root } from "mdast";
import { remark } from "remark";
import { visit } from "unist-util-visit";

/** A heading node with its depth and text content */
export interface MarkdownHeading {
    readonly text: string;
    readonly depth: number;
    readonly position: { readonly line: number };
}

/** A code block node */
export interface MarkdownCodeBlock {
    readonly value: string;
    readonly lang?: string;
    readonly position: { readonly line: number };
    /** Index of the node in the root children list */
    readonly nodeIndex: number;
}

/** An inline code node */
export interface MarkdownInlineCode {
    readonly value: string;
    readonly position: { readonly line: number };
}

/** Extracted structural features from a Markdown file */
export interface MarkdownStructure {
    readonly headings: readonly MarkdownHeading[];
    readonly codeBlocks: readonly MarkdownCodeBlock[];
    readonly inlineCodes: readonly MarkdownInlineCode[];
    readonly ast: Root;
}

/**
 * Port for Markdown AST operations.
 */
export interface MarkdownAstGateway {
    parseFile(filePath: string): Promise<MarkdownStructure>;
    parseContent(content: string): MarkdownStructure;
}

/**
 * Remark-based implementation of the Markdown AST gateway.
 */
export class RemarkMarkdownAstGateway implements MarkdownAstGateway {
    async parseFile(filePath: string): Promise<MarkdownStructure> {
        const content = await readFile(filePath, "utf-8");
        return this.parseContent(content);
    }

    parseContent(content: string): MarkdownStructure {
        const processor = remark();
        const ast = processor.parse(content);

        const headings: MarkdownHeading[] = [];
        const codeBlocks: MarkdownCodeBlock[] = [];
        const inlineCodes: MarkdownInlineCode[] = [];

        visit(ast, "heading", (node: Heading) => {
            const text = this.extractHeadingText(node);
            headings.push({
                text,
                depth: node.depth,
                position: {
                    line: node.position?.start.line ?? 0,
                },
            });
        });

        // Track code blocks with their node index in root children
        for (let i = 0; i < ast.children.length; i++) {
            const child = ast.children[i];
            if (child.type === "code") {
                const codeNode = child as Code;
                codeBlocks.push({
                    value: codeNode.value,
                    lang: codeNode.lang ?? undefined,
                    position: {
                        line: codeNode.position?.start.line ?? 0,
                    },
                    nodeIndex: i,
                });
            }
        }

        visit(ast, "inlineCode", (node: InlineCode) => {
            inlineCodes.push({
                value: node.value,
                position: {
                    line: node.position?.start.line ?? 0,
                },
            });
        });

        return { headings, codeBlocks, inlineCodes, ast };
    }

    private extractHeadingText(node: Heading): string {
        const parts: string[] = [];
        visit(node, "text", (textNode: { value: string }) => {
            parts.push(textNode.value);
        });
        return parts.join("");
    }
}

/**
 * Checks if text in sibling nodes within a proximity window contains conditional keywords.
 */
export function findConditionalKeywordsInProximity(
    ast: Root,
    codeBlockNodeIndex: number,
    proximityWindow: number,
    keywords: readonly string[],
): boolean {
    const endIndex = Math.min(
        ast.children.length,
        codeBlockNodeIndex + 1 + proximityWindow,
    );

    for (let i = codeBlockNodeIndex + 1; i < endIndex; i++) {
        const sibling = ast.children[i];
        const text = extractTextFromNode(sibling);
        const lowerText = text.toLowerCase();

        for (const keyword of keywords) {
            const pattern = new RegExp(`\\b${keyword}\\b`, "i");
            if (pattern.test(lowerText)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Extracts plain text content from any AST node recursively.
 */
function extractTextFromNode(node: { type: string; children?: unknown[]; value?: string }): string {
    if (node.value && typeof node.value === "string") {
        return node.value;
    }

    if (Array.isArray(node.children)) {
        return (node.children as { type: string; children?: unknown[]; value?: string }[])
            .map((child) => extractTextFromNode(child))
            .join(" ");
    }

    return "";
}

/**
 * Creates and returns the default Markdown AST gateway.
 */
export function createMarkdownAstGateway(): MarkdownAstGateway {
    return new RemarkMarkdownAstGateway();
}
