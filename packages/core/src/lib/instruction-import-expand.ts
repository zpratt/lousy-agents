/**
 * Pure Claude `@` import expander that builds an ordered EffectiveDocument.
 */

import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import {
    readTextWithinRoot,
    resolvePathWithinRoot,
    statWithinRoot,
} from "../gateways/file-system-utils.js";

export const DEFAULT_MAX_IMPORT_DEPTH = 4;
export const DEFAULT_MAX_UNIQUE_FILES = 64;
export const DEFAULT_MAX_EDGES = 256;
export const DEFAULT_MAX_EMITTED_BYTES = 512_000;
export const DEFAULT_MAX_FILE_BYTES = 1_048_576;

/** Aligns with doctor HARD_IMPORT: line-start `@path` where path includes `/`. */
const HARD_IMPORT_GLOBAL_RE = /^@([^\s@][^\s]*)/gm;

const FENCED_CODE_RE = /^(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^\1[ \t]*$/gm;
const INLINE_CODE_RE = /`+[^`\r\n]*`+/g;

export type ImportEdgeStatus =
    | "resolved"
    | "unresolved"
    | "escape"
    | "symlink"
    | "cycle"
    | "depth-exceeded"
    | "size-exceeded"
    | "not-regular"
    | "absolute"
    | "home";

export interface TextRange {
    readonly start: number;
    readonly end: number;
}

export interface ImportEdge {
    readonly importer: string;
    readonly tokenRange: TextRange;
    readonly rawTarget: string;
    readonly target?: string;
    readonly status: ImportEdgeStatus;
    readonly ruleId?: string;
}

export interface EffectiveSegment {
    readonly effectiveRange: TextRange;
    readonly sourcePath: string;
    readonly sourceRange: TextRange;
    readonly importChain: readonly string[];
}

export interface ExpansionDiagnostic {
    readonly ruleId: string;
    readonly message: string;
    readonly filePath: string;
    readonly range?: TextRange;
}

export interface EffectiveDocument {
    readonly root: string;
    readonly content: string;
    readonly orderedSegments: readonly EffectiveSegment[];
    readonly edges: readonly ImportEdge[];
    readonly expansionDiagnostics: readonly ExpansionDiagnostic[];
}

export interface ExpansionLimits {
    readonly maxDepth: number;
    readonly maxUniqueFiles: number;
    readonly maxEdges: number;
    readonly maxEmittedBytes: number;
    readonly maxFileBytes: number;
}

export interface BuildEffectiveDocumentInput {
    readonly repoRoot: string;
    readonly rootRelativePath: string;
    readonly limits?: Partial<ExpansionLimits>;
}

interface ImportToken {
    readonly start: number;
    readonly end: number;
    readonly rawTarget: string;
}

interface ExpandResult {
    readonly content: string;
    readonly segments: EffectiveSegment[];
}

interface MutableState {
    readonly limits: ExpansionLimits;
    readonly contentCache: Map<string, string>;
    readonly uniqueFiles: Set<string>;
    readonly edges: ImportEdge[];
    readonly diagnostics: ExpansionDiagnostic[];
    emittedBytes: number;
}

function resolveLimits(
    overrides: Partial<ExpansionLimits> | undefined,
): ExpansionLimits {
    return {
        maxDepth: overrides?.maxDepth ?? DEFAULT_MAX_IMPORT_DEPTH,
        maxUniqueFiles: overrides?.maxUniqueFiles ?? DEFAULT_MAX_UNIQUE_FILES,
        maxEdges: overrides?.maxEdges ?? DEFAULT_MAX_EDGES,
        maxEmittedBytes:
            overrides?.maxEmittedBytes ?? DEFAULT_MAX_EMITTED_BYTES,
        maxFileBytes: overrides?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    };
}

function toPosixRelative(pathValue: string): string {
    return pathValue.split(sep).join("/");
}

function isInsideCodeRegion(
    index: number,
    regions: readonly TextRange[],
): boolean {
    return regions.some(
        (region) => index >= region.start && index < region.end,
    );
}

function findCodeRegions(content: string): TextRange[] {
    const regions: TextRange[] = [];

    for (const match of content.matchAll(FENCED_CODE_RE)) {
        if (match.index === undefined) {
            continue;
        }
        regions.push({
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    for (const match of content.matchAll(INLINE_CODE_RE)) {
        if (match.index === undefined) {
            continue;
        }
        if (isInsideCodeRegion(match.index, regions)) {
            continue;
        }
        regions.push({
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    return regions;
}

function findImportTokens(content: string): ImportToken[] {
    const codeRegions = findCodeRegions(content);
    const tokens: ImportToken[] = [];

    for (const match of content.matchAll(HARD_IMPORT_GLOBAL_RE)) {
        if (match.index === undefined) {
            continue;
        }
        const rawTarget = match[1];
        if (!rawTarget?.includes("/")) {
            continue;
        }
        if (isInsideCodeRegion(match.index, codeRegions)) {
            continue;
        }
        tokens.push({
            start: match.index,
            end: match.index + match[0].length,
            rawTarget,
        });
    }

    return tokens;
}

function rebaseSegments(
    segments: readonly EffectiveSegment[],
    offset: number,
): EffectiveSegment[] {
    return segments.map((segment) => ({
        ...segment,
        effectiveRange: {
            start: segment.effectiveRange.start + offset,
            end: segment.effectiveRange.end + offset,
        },
    }));
}

function appendLiteralSegment(
    segments: EffectiveSegment[],
    contentOffset: number,
    sourcePath: string,
    sourceStart: number,
    text: string,
    importChain: readonly string[],
): void {
    if (text.length === 0) {
        return;
    }
    segments.push({
        effectiveRange: {
            start: contentOffset,
            end: contentOffset + text.length,
        },
        sourcePath,
        sourceRange: {
            start: sourceStart,
            end: sourceStart + text.length,
        },
        importChain: [...importChain],
    });
}

function ruleIdForStatus(status: ImportEdgeStatus): string | undefined {
    switch (status) {
        case "unresolved":
            return "instruction/import-unresolved";
        case "escape":
        case "absolute":
        case "home":
            return "instruction/import-escape";
        case "symlink":
            return "instruction/import-symlink";
        case "cycle":
            return "instruction/import-cycle";
        case "depth-exceeded":
            return "instruction/import-depth-exceeded";
        case "size-exceeded":
            return "instruction/import-size-exceeded";
        case "not-regular":
            return "instruction/import-unresolved";
        case "resolved":
            return undefined;
    }
}

function messageForFailure(
    status: ImportEdgeStatus,
    rawTarget: string,
): string {
    switch (status) {
        case "unresolved":
            return `Import target could not be resolved: ${rawTarget}`;
        case "escape":
            return `Import target escapes the repository root: ${rawTarget}`;
        case "absolute":
            return `Absolute import paths are not allowed: ${rawTarget}`;
        case "home":
            return `Home-directory import paths are not allowed: ${rawTarget}`;
        case "symlink":
            return `Import target path contains a symbolic link: ${rawTarget}`;
        case "cycle":
            return `Import cycle detected while resolving: ${rawTarget}`;
        case "depth-exceeded":
            return `Import depth limit exceeded while resolving: ${rawTarget}`;
        case "size-exceeded":
            return `Import expansion size or graph limit exceeded while resolving: ${rawTarget}`;
        case "not-regular":
            return `Import target is not a regular file: ${rawTarget}`;
        case "resolved":
            return "";
    }
}

function recordEdge(state: MutableState, edge: ImportEdge): void {
    state.edges.push(edge);
    if (edge.status === "resolved" || !edge.ruleId) {
        return;
    }
    state.diagnostics.push({
        ruleId: edge.ruleId,
        message: messageForFailure(edge.status, edge.rawTarget),
        filePath: edge.importer,
        range: edge.tokenRange,
    });
}

function classifyPathError(error: unknown): ImportEdgeStatus {
    if (!(error instanceof Error)) {
        return "unresolved";
    }
    const message = error.message;
    if (
        message.includes("outside target directory") ||
        message.includes("invalid-path") ||
        message.includes("outside-workspace")
    ) {
        return "escape";
    }
    if (
        message.includes("Symlinks are not allowed") ||
        message.includes("symbolic link") ||
        message.includes("path-alias")
    ) {
        return "symlink";
    }
    if (
        message.includes("exceeds size limit") ||
        message.includes("too-large")
    ) {
        return "size-exceeded";
    }
    if ("code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return "unresolved";
    }
    if (message.includes("ENOENT") || message.includes("not found")) {
        return "unresolved";
    }
    return "unresolved";
}

function normalizeRelativeWithinRoot(
    importerRelativePath: string,
    rawTarget: string,
):
    | { ok: true; relativePath: string }
    | { ok: false; status: ImportEdgeStatus } {
    if (
        rawTarget === "~" ||
        rawTarget.startsWith("~/") ||
        rawTarget.startsWith("~\\")
    ) {
        return { ok: false, status: "home" };
    }
    if (isAbsolute(rawTarget)) {
        return { ok: false, status: "absolute" };
    }

    const importerDir = dirname(importerRelativePath);
    const joined = normalize(join(importerDir, rawTarget));
    const normalized = joined === "." ? "" : joined;

    if (
        normalized === ".." ||
        normalized.startsWith(`..${sep}`) ||
        normalized.startsWith("../") ||
        normalized.startsWith("..\\")
    ) {
        return { ok: false, status: "escape" };
    }

    if (!normalized) {
        return { ok: false, status: "unresolved" };
    }

    return { ok: true, relativePath: toPosixRelative(normalized) };
}

async function readCachedFile(
    repoRoot: string,
    relativePath: string,
    state: MutableState,
): Promise<
    | { ok: true; content: string; isNewUnique: boolean }
    | { ok: false; status: ImportEdgeStatus }
> {
    const cached = state.contentCache.get(relativePath);
    if (cached !== undefined) {
        return { ok: true, content: cached, isNewUnique: false };
    }

    try {
        await resolvePathWithinRoot(repoRoot, relativePath);
    } catch (error: unknown) {
        return { ok: false, status: classifyPathError(error) };
    }

    try {
        const stats = await statWithinRoot(repoRoot, relativePath);
        if (stats.isSymbolicLink) {
            return { ok: false, status: "symlink" };
        }
        if (!stats.isFile) {
            return { ok: false, status: "not-regular" };
        }
    } catch (error: unknown) {
        return { ok: false, status: classifyPathError(error) };
    }

    const isNewUnique = !state.uniqueFiles.has(relativePath);
    if (isNewUnique && state.uniqueFiles.size >= state.limits.maxUniqueFiles) {
        return { ok: false, status: "size-exceeded" };
    }

    try {
        const content = await readTextWithinRoot(
            repoRoot,
            relativePath,
            state.limits.maxFileBytes,
        );
        state.contentCache.set(relativePath, content);
        if (isNewUnique) {
            state.uniqueFiles.add(relativePath);
        }
        return { ok: true, content, isNewUnique };
    } catch (error: unknown) {
        return { ok: false, status: classifyPathError(error) };
    }
}

async function expandContent(
    repoRoot: string,
    sourcePath: string,
    content: string,
    hop: number,
    stack: readonly string[],
    importChain: readonly string[],
    state: MutableState,
): Promise<ExpandResult> {
    const tokens = findImportTokens(content);
    const segments: EffectiveSegment[] = [];
    let output = "";
    let cursor = 0;

    const flushLiteral = (from: number, to: number): boolean => {
        if (to <= from) {
            return true;
        }
        const text = content.slice(from, to);
        if (state.emittedBytes + text.length > state.limits.maxEmittedBytes) {
            return false;
        }
        appendLiteralSegment(
            segments,
            output.length,
            sourcePath,
            from,
            text,
            importChain,
        );
        output += text;
        state.emittedBytes += text.length;
        return true;
    };

    for (const token of tokens) {
        if (!flushLiteral(cursor, token.start)) {
            recordEdge(state, {
                importer: sourcePath,
                tokenRange: { start: token.start, end: token.end },
                rawTarget: token.rawTarget,
                status: "size-exceeded",
                ruleId: ruleIdForStatus("size-exceeded"),
            });
            // Keep remaining source literal if possible, else stop.
            const rest = content.slice(token.start);
            const room = state.limits.maxEmittedBytes - state.emittedBytes;
            if (room > 0) {
                const clipped = rest.slice(0, room);
                appendLiteralSegment(
                    segments,
                    output.length,
                    sourcePath,
                    token.start,
                    clipped,
                    importChain,
                );
                output += clipped;
                state.emittedBytes += clipped.length;
            }
            return { content: output, segments };
        }

        const expansion = await expandToken(
            repoRoot,
            sourcePath,
            token,
            hop,
            stack,
            importChain,
            state,
            output.length,
        );

        if (expansion.kind === "expanded") {
            output += expansion.content;
            segments.push(...expansion.segments);
        } else {
            const tokenText = content.slice(token.start, token.end);
            if (
                state.emittedBytes + tokenText.length >
                state.limits.maxEmittedBytes
            ) {
                const room = state.limits.maxEmittedBytes - state.emittedBytes;
                if (room > 0) {
                    const clipped = tokenText.slice(0, room);
                    appendLiteralSegment(
                        segments,
                        output.length,
                        sourcePath,
                        token.start,
                        clipped,
                        importChain,
                    );
                    output += clipped;
                    state.emittedBytes += clipped.length;
                }
                return { content: output, segments };
            }
            appendLiteralSegment(
                segments,
                output.length,
                sourcePath,
                token.start,
                tokenText,
                importChain,
            );
            output += tokenText;
            state.emittedBytes += tokenText.length;
        }

        cursor = token.end;
    }

    if (!flushLiteral(cursor, content.length)) {
        const rest = content.slice(cursor);
        const room = state.limits.maxEmittedBytes - state.emittedBytes;
        if (room > 0) {
            const clipped = rest.slice(0, room);
            appendLiteralSegment(
                segments,
                output.length,
                sourcePath,
                cursor,
                clipped,
                importChain,
            );
            output += clipped;
            state.emittedBytes += clipped.length;
        }
    }

    return { content: output, segments };
}

async function expandToken(
    repoRoot: string,
    importerPath: string,
    token: ImportToken,
    hop: number,
    stack: readonly string[],
    importChain: readonly string[],
    state: MutableState,
    outputOffset: number,
): Promise<
    | { kind: "expanded"; content: string; segments: EffectiveSegment[] }
    | { kind: "unexpanded" }
> {
    const fail = (
        status: ImportEdgeStatus,
        target?: string,
    ): { kind: "unexpanded" } => {
        recordEdge(state, {
            importer: importerPath,
            tokenRange: { start: token.start, end: token.end },
            rawTarget: token.rawTarget,
            target,
            status,
            ruleId: ruleIdForStatus(status),
        });
        return { kind: "unexpanded" };
    };

    if (state.edges.length >= state.limits.maxEdges) {
        return fail("size-exceeded");
    }

    const nextHop = hop + 1;
    if (nextHop > state.limits.maxDepth) {
        return fail("depth-exceeded");
    }

    const normalized = normalizeRelativeWithinRoot(
        importerPath,
        token.rawTarget,
    );
    if (!normalized.ok) {
        return fail(normalized.status);
    }

    const targetPath = normalized.relativePath;

    if (stack.includes(targetPath)) {
        return fail("cycle", targetPath);
    }

    // Pre-check emitted budget with a zero-length probe: actual size checked after read.
    const readResult = await readCachedFile(repoRoot, targetPath, state);
    if (!readResult.ok) {
        return fail(readResult.status, targetPath);
    }

    if (state.emittedBytes >= state.limits.maxEmittedBytes) {
        return fail("size-exceeded", targetPath);
    }

    // Temporarily reserve uniqueness already handled in readCachedFile.
    const child = await expandContent(
        repoRoot,
        targetPath,
        readResult.content,
        nextHop,
        [...stack, targetPath],
        [...importChain, targetPath],
        state,
    );

    // expandContent already accounted emitted bytes for child content.
    recordEdge(state, {
        importer: importerPath,
        tokenRange: { start: token.start, end: token.end },
        rawTarget: token.rawTarget,
        target: targetPath,
        status: "resolved",
    });

    return {
        kind: "expanded",
        content: child.content,
        segments: rebaseSegments(child.segments, outputOffset),
    };
}

/**
 * Build an ordered effective document by expanding verified Claude `@` imports.
 */
export async function buildEffectiveDocument(
    input: BuildEffectiveDocumentInput,
): Promise<EffectiveDocument> {
    const limits = resolveLimits(input.limits);
    const rootRelativePath = toPosixRelative(normalize(input.rootRelativePath));

    if (
        !rootRelativePath ||
        rootRelativePath === ".." ||
        rootRelativePath.startsWith(`..${sep}`) ||
        rootRelativePath.startsWith("../") ||
        isAbsolute(rootRelativePath)
    ) {
        throw new Error(
            `Root path is outside repository root: ${input.rootRelativePath}`,
        );
    }

    const state: MutableState = {
        limits,
        contentCache: new Map(),
        uniqueFiles: new Set(),
        edges: [],
        diagnostics: [],
        emittedBytes: 0,
    };

    const rootRead = await readCachedFile(
        input.repoRoot,
        rootRelativePath,
        state,
    );
    if (!rootRead.ok) {
        throw new Error(
            `Unable to read root instruction file ${rootRelativePath}: ${rootRead.status}`,
        );
    }

    // Ensure relative() style identity for stack membership
    const rootKey = rootRelativePath;
    const expanded = await expandContent(
        input.repoRoot,
        rootKey,
        rootRead.content,
        0,
        [rootKey],
        [rootKey],
        state,
    );

    return {
        root: rootKey,
        content: expanded.content,
        orderedSegments: expanded.segments,
        edges: state.edges,
        expansionDiagnostics: state.diagnostics,
    };
}
