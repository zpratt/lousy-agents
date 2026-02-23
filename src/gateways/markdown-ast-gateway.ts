/**
 * Gateway for parsing Markdown files into AST using remark.
 * Extracts structural features like headings, code blocks, and paragraphs.
 */

import { readFile } from "node:fs/promises";
import type { Code, Heading, InlineCode } from "mdast";
import { remark } from "remark";
import { visit } from "unist-util-visit";
import type {
    MarkdownAstGateway,
    MarkdownCodeBlock,
    MarkdownHeading,
    MarkdownInlineCode,
    MarkdownStructure,
} from "../use-cases/analyze-instruction-quality.js";

// Re-export types for consumers that need them
export type {
    MarkdownAstGateway,
    MarkdownCodeBlock,
    MarkdownHeading,
    MarkdownInlineCode,
    MarkdownStructure,
};

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

    findConditionalKeywordsInProximity(
        structure: MarkdownStructure,
        codeBlockNodeIndex: number,
        proximityWindow: number,
        keywords: readonly string[],
    ): boolean {
        const ast = structure.ast;
        const endIndex = Math.min(
            ast.children.length,
            codeBlockNodeIndex + 1 + proximityWindow,
        );

        for (let i = codeBlockNodeIndex + 1; i < endIndex; i++) {
            const sibling = ast.children[i];
            const text = extractTextFromNode(sibling);
            const lowerText = text.toLowerCase();

            for (const keyword of keywords) {
                if (containsWordBoundary(lowerText, keyword.toLowerCase())) {
                    return true;
                }
            }
        }

        return false;
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
 * Checks if text contains a keyword at a word boundary (safe string matching, no regex).
 */
function containsWordBoundary(text: string, keyword: string): boolean {
    const index = text.indexOf(keyword);
    if (index === -1) {
        return false;
    }

    const charBefore = index > 0 ? text[index - 1] : " ";
    const charAfter =
        index + keyword.length < text.length
            ? text[index + keyword.length]
            : " ";

    const isWordBoundaryBefore = !/[a-z0-9]/i.test(charBefore);
    const isWordBoundaryAfter = !/[a-z0-9]/i.test(charAfter);

    return isWordBoundaryBefore && isWordBoundaryAfter;
}

/**
 * Extracts plain text content from any AST node recursively.
 */
function extractTextFromNode(node: {
    type: string;
    children?: unknown[];
    value?: string;
}): string {
    if (node.value && typeof node.value === "string") {
        return node.value;
    }

    if (Array.isArray(node.children)) {
        return (
            node.children as {
                type: string;
                children?: unknown[];
                value?: string;
            }[]
        )
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
