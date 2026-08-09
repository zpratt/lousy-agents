/**
 * Adapter that expands Claude `@path` imports via the pure expander library.
 */

import { isAbsolute, relative, sep } from "node:path";
import { buildEffectiveDocument } from "../lib/instruction-import-expand.js";
import type { ClaudeInstructionImportExpander } from "../use-cases/analyze-instruction-quality.js";

function toRepoRelativePosix(
    repoRoot: string,
    absoluteFilePath: string,
): string {
    const relativePath = relative(repoRoot, absoluteFilePath);
    if (
        relativePath.length === 0 ||
        relativePath.startsWith(`..${sep}`) ||
        relativePath === ".." ||
        isAbsolute(relativePath)
    ) {
        throw new Error(
            `Claude instruction path is outside repository root: ${absoluteFilePath}`,
        );
    }
    return relativePath.split(sep).join("/");
}

/**
 * Creates the default Claude instruction import expander used by composition roots.
 */
export function createClaudeInstructionImportExpander(): ClaudeInstructionImportExpander {
    return {
        async expandClaudeEntrypoint(input) {
            const rootRelativePath = toRepoRelativePosix(
                input.repoRoot,
                input.absoluteFilePath,
            );
            const document = await buildEffectiveDocument({
                repoRoot: input.repoRoot,
                rootRelativePath,
            });
            return { content: document.content };
        },
    };
}
