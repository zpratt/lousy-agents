/**
 * Adapter that expands Claude `@path` imports via the pure expander library.
 */

import { isAbsolute, join, relative, sep } from "node:path";
import {
    createSourcePositionIndex,
    type SourcePosition,
} from "../entities/source-position.js";
import {
    buildEffectiveDocument,
    DEFAULT_MAX_FILE_BYTES,
} from "../lib/instruction-import-expand.js";
import type {
    ClaudeImportExpansionDiagnostic,
    ClaudeInstructionImportExpander,
    EffectiveClaudeInstructionDocument,
} from "../use-cases/analyze-instruction-quality.js";
import {
    type BoundedReadOutcome,
    readRegularFileNoFollow,
} from "./read-regular-file-no-follow.js";

/**
 * Reads an importer file so byte ranges can be mapped to line and column.
 */
export type ReadImporterSource = (
    absolutePath: string,
    maxBytes: number,
) => Promise<BoundedReadOutcome>;

export interface ClaudeInstructionImportExpanderOptions {
    /** Defaults to the bounded no-follow reader */
    readonly readSource?: ReadImporterSource;
}

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

/**
 * Reads an importer, bounded and without following symlinks. An importer that
 * can no longer be read safely has no content, so its diagnostics fall back to
 * line 1, column 1 instead of failing the whole expansion.
 */
type PositionOf = (offset: number) => SourcePosition;

async function readImporterSource(
    readSource: ReadImporterSource,
    absolutePath: string,
): Promise<readonly [string, PositionOf | null]> {
    const outcome = await readSource(absolutePath, DEFAULT_MAX_FILE_BYTES);
    return [
        absolutePath,
        outcome.ok ? createSourcePositionIndex(outcome.content) : null,
    ];
}

async function mapExpansionDiagnostics(
    repoRoot: string,
    diagnostics: readonly {
        readonly ruleId: string;
        readonly message: string;
        readonly filePath: string;
        readonly range?: { readonly start: number; readonly end: number };
    }[],
    readSource: ReadImporterSource,
): Promise<ClaudeImportExpansionDiagnostic[]> {
    const located = diagnostics.map((diagnostic) => ({
        diagnostic,
        absolutePath: toAbsolutePath(repoRoot, diagnostic.filePath),
    }));
    const importerPaths = new Set(located.map((entry) => entry.absolutePath));
    const contentByPath = new Map(
        await Promise.all(
            [...importerPaths].map((path) =>
                readImporterSource(readSource, path),
            ),
        ),
    );

    return located.map(({ diagnostic, absolutePath }) =>
        toExpansionDiagnostic(
            diagnostic,
            absolutePath,
            contentByPath.get(absolutePath) ?? null,
        ),
    );
}

function toExpansionDiagnostic(
    diagnostic: {
        readonly ruleId: string;
        readonly message: string;
        readonly range?: { readonly start: number; readonly end: number };
    },
    absolutePath: string,
    positionOf: PositionOf | null,
): ClaudeImportExpansionDiagnostic {
    if (diagnostic.range === undefined || positionOf === null) {
        return {
            ruleId: diagnostic.ruleId,
            message: diagnostic.message,
            filePath: absolutePath,
            line: 1,
            column: 1,
        };
    }

    const start = positionOf(diagnostic.range.start);
    const end = positionOf(diagnostic.range.end);
    return {
        ruleId: diagnostic.ruleId,
        message: diagnostic.message,
        filePath: absolutePath,
        line: start.line,
        column: start.column,
        endLine: end.line,
        endColumn: end.column,
    };
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
export function createClaudeInstructionImportExpander(
    options: ClaudeInstructionImportExpanderOptions = {},
): ClaudeInstructionImportExpander {
    const readSource = options.readSource ?? readRegularFileNoFollow;

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
                readSource,
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
