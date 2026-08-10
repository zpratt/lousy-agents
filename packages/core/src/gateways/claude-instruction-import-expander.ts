/**
 * Adapter that expands Claude `@path` imports via the pure expander library.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { offsetToSourcePosition } from "../entities/source-position.js";
import { buildEffectiveDocument } from "../lib/instruction-import-expand.js";
import type {
    ClaudeImportExpansionDiagnostic,
    ClaudeInstructionImportExpander,
    EffectiveClaudeInstructionDocument,
} from "../use-cases/analyze-instruction-quality.js";

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

function toAbsolutePath(repoRoot: string, relativePosixPath: string): string {
    return join(repoRoot, ...relativePosixPath.split("/"));
}

async function mapExpansionDiagnostics(
    repoRoot: string,
    diagnostics: readonly {
        readonly ruleId: string;
        readonly message: string;
        readonly filePath: string;
        readonly range?: { readonly start: number; readonly end: number };
    }[],
): Promise<ClaudeImportExpansionDiagnostic[]> {
    const contentByRelative = new Map<string, string>();
    const mapped: ClaudeImportExpansionDiagnostic[] = [];

    for (const diagnostic of diagnostics) {
        const absolutePath = toAbsolutePath(repoRoot, diagnostic.filePath);
        let content = contentByRelative.get(diagnostic.filePath);
        if (content === undefined) {
            content = await readFile(absolutePath, "utf8");
            contentByRelative.set(diagnostic.filePath, content);
        }

        if (diagnostic.range === undefined) {
            mapped.push({
                ruleId: diagnostic.ruleId,
                message: diagnostic.message,
                filePath: absolutePath,
                line: 1,
                column: 1,
            });
            continue;
        }

        const start = offsetToSourcePosition(content, diagnostic.range.start);
        const end = offsetToSourcePosition(content, diagnostic.range.end);
        mapped.push({
            ruleId: diagnostic.ruleId,
            message: diagnostic.message,
            filePath: absolutePath,
            line: start.line,
            column: start.column,
            endLine: end.line,
            endColumn: end.column,
        });
    }

    return mapped;
}

function collectResolvedImports(
    repoRoot: string,
    edges: readonly {
        readonly status: string;
        readonly target?: string;
    }[],
): string[] {
    const resolved: string[] = [];
    const seen = new Set<string>();
    for (const edge of edges) {
        if (edge.status !== "resolved" || edge.target === undefined) {
            continue;
        }
        const absolute = toAbsolutePath(repoRoot, edge.target);
        if (seen.has(absolute)) {
            continue;
        }
        seen.add(absolute);
        resolved.push(absolute);
    }
    return resolved;
}

/**
 * Creates the default Claude instruction import expander used by composition roots.
 */
export function createClaudeInstructionImportExpander(): ClaudeInstructionImportExpander {
    return {
        async expandClaudeEntrypoint(
            input,
        ): Promise<EffectiveClaudeInstructionDocument> {
            const rootRelativePath = toRepoRelativePosix(
                input.repoRoot,
                input.absoluteFilePath,
            );
            const document = await buildEffectiveDocument({
                repoRoot: input.repoRoot,
                rootRelativePath,
            });
            const expansionDiagnostics = await mapExpansionDiagnostics(
                input.repoRoot,
                document.expansionDiagnostics,
            );
            return {
                content: document.content,
                effectiveRoot: input.absoluteFilePath,
                resolvedImports: collectResolvedImports(
                    input.repoRoot,
                    document.edges,
                ),
                expansionDiagnostics,
            };
        },
    };
}
