/**
 * Pure Claude `@` import expander that builds an ordered EffectiveDocument.
 */

import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { externalImportMessage } from "../entities/external-import-message.js";
import { resolvePathWithinRoot } from "../gateways/file-system-utils.js";
import {
    type BoundedReadOutcome,
    type FileIdentity,
    readRegularFileNoFollow,
} from "../gateways/read-regular-file-no-follow.js";
import {
    inspectPathWithinRoot,
    type PathInspection,
} from "../gateways/real-path-within-root.js";
import {
    type LocatedFile,
    relativeToAnyRoot,
    statusForReadFailure,
    toLocatedFile,
} from "./import-file-location.js";

export const DEFAULT_MAX_IMPORT_DEPTH = 4;
export const DEFAULT_MAX_UNIQUE_FILES = 64;
export const DEFAULT_MAX_EDGES = 256;
export const DEFAULT_MAX_EMITTED_BYTES = 512_000;
export const DEFAULT_MAX_FILE_BYTES = 1_048_576;

/** Line-start `@path` where path includes `/` (shared with doctor via findImportTokens). */
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
    | "hard-linked"
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

/**
 * The file system operations import expansion depends on. Injectable so the
 * window between checking a target and reading it can be tested.
 */
export interface ImportFileSystem {
    /** Follows a path to its real location, reporting why it is unusable */
    inspect(rootReal: string, absolutePath: string): Promise<PathInspection>;
    /** Reads a real path, which must still be the file identified at check time */
    read(
        realPath: string,
        maxBytes: number,
        expectedIdentity: FileIdentity,
    ): Promise<BoundedReadOutcome>;
}

const nodeImportFileSystem: ImportFileSystem = {
    inspect: inspectPathWithinRoot,
    read: (realPath, maxBytes, expectedIdentity) =>
        readRegularFileNoFollow(realPath, maxBytes, { expectedIdentity }),
};

export interface BuildEffectiveDocumentInput {
    readonly repoRoot: string;
    readonly rootRelativePath: string;
    readonly limits?: Partial<ExpansionLimits>;
    /** Overrides any part of the real file system; the rest stays real */
    readonly fileSystem?: Partial<ImportFileSystem>;
}

export interface ImportToken {
    readonly start: number;
    readonly end: number;
    readonly rawTarget: string;
}

interface ExpandResult {
    readonly content: string;
    readonly segments: readonly EffectiveSegment[];
}

type TokenExpansion =
    | {
          kind: "expanded";
          content: string;
          segments: readonly EffectiveSegment[];
      }
    | { kind: "unexpanded" };

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

function collectRegexRanges(
    content: string,
    pattern: RegExp,
    skipInside?: readonly TextRange[],
): TextRange[] {
    const regions: TextRange[] = [];
    for (const match of content.matchAll(pattern)) {
        if (match.index === undefined) {
            continue;
        }
        if (skipInside && isInsideCodeRegion(match.index, skipInside)) {
            continue;
        }
        regions.push({
            start: match.index,
            end: match.index + match[0].length,
        });
    }
    return regions;
}

function findCodeRegions(content: string): TextRange[] {
    const fenced = collectRegexRanges(content, FENCED_CODE_RE);
    const inline = collectRegexRanges(content, INLINE_CODE_RE, fenced);
    return [...fenced, ...inline];
}

/**
 * Finds the Claude `@path` import tokens in markdown content, ignoring
 * fenced and inline code. This is the single tokenizer shared by import
 * expansion and the doctor edge parser.
 */
export function findImportTokens(content: string): ImportToken[] {
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

function createLiteralSegment(
    contentOffset: number,
    sourcePath: string,
    sourceStart: number,
    text: string,
    importChain: readonly string[],
): EffectiveSegment | undefined {
    if (text.length === 0) {
        return undefined;
    }
    return {
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
    };
}

const RULE_ID_BY_STATUS = {
    unresolved: "instruction/import-unresolved",
    "not-regular": "instruction/import-unresolved",
    "hard-linked": "instruction/import-unresolved",
    escape: "instruction/import-escape",
    absolute: "instruction/import-escape",
    home: "instruction/import-escape",
    symlink: "instruction/import-symlink",
    cycle: "instruction/import-cycle",
    "depth-exceeded": "instruction/import-depth-exceeded",
    "size-exceeded": "instruction/import-size-exceeded",
    resolved: undefined,
} as const satisfies Record<ImportEdgeStatus, string | undefined>;

const FAILURE_MESSAGE_BY_STATUS = {
    unresolved: (rawTarget: string) =>
        `Import target could not be resolved: ${rawTarget}`,
    escape: (rawTarget: string) =>
        externalImportMessage(rawTarget, "outside-working-directory"),
    absolute: (rawTarget: string) =>
        externalImportMessage(rawTarget, "outside-working-directory"),
    home: (rawTarget: string) => externalImportMessage(rawTarget, "home"),
    symlink: (rawTarget: string) =>
        `Import target path contains a symbolic link: ${rawTarget}`,
    cycle: (rawTarget: string) =>
        `Import cycle detected while resolving: ${rawTarget}`,
    "depth-exceeded": (rawTarget: string) =>
        `Import depth limit exceeded while resolving: ${rawTarget}`,
    "size-exceeded": (rawTarget: string) =>
        `Import expansion size or graph limit exceeded while resolving: ${rawTarget}`,
    "not-regular": (rawTarget: string) =>
        `Import target is not a regular file: ${rawTarget}`,
    "hard-linked": (rawTarget: string) =>
        `Import target has more than one hard link and is not read: ${rawTarget}`,
    resolved: () => "",
} as const satisfies Record<ImportEdgeStatus, (rawTarget: string) => string>;

function ruleIdForStatus(status: ImportEdgeStatus): string | undefined {
    return RULE_ID_BY_STATUS[status];
}

function messageForFailure(
    status: ImportEdgeStatus,
    rawTarget: string,
): string {
    return FAILURE_MESSAGE_BY_STATUS[status](rawTarget);
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
    return "unresolved";
}

/**
 * Classifies an import target relative to its importer without touching the
 * file system: home-directory targets, absolute targets outside every given
 * root, and repository-escaping targets are rejected as external; anything
 * else yields a repository-relative POSIX path.
 *
 * An absolute target inside one of `repoRoots` is valid, because Claude Code
 * loads absolute paths inside the working directory (observed on Claude Code
 * 2.1.316). Pass every spelling of the root (its path and its real path). With
 * no roots, every absolute target is rejected.
 */
export function normalizeRelativeWithinRoot(
    importerRelativePath: string,
    rawTarget: string,
    repoRoots: readonly string[] = [],
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
        return relativeToAnyRoot(rawTarget, repoRoots);
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

function isUnsafeRootPath(rootRelativePath: string): boolean {
    return (
        !rootRelativePath ||
        rootRelativePath === ".." ||
        rootRelativePath.startsWith(`..${sep}`) ||
        rootRelativePath.startsWith("../") ||
        isAbsolute(rootRelativePath)
    );
}

type ReadFileResult =
    | { ok: true; content: string; real: string }
    | { ok: false; status: ImportEdgeStatus };

/**
 * Owns expansion bookkeeping for a single buildEffectiveDocument call.
 * Mutations stay on the session instance rather than shared parameter bags.
 */
class ExpansionSession {
    readonly limits: ExpansionLimits;
    private readonly rootReal: string;
    private readonly fileSystem: ImportFileSystem;
    /** File content keyed by real repository-relative path */
    private readonly contentByReal = new Map<string, string>();
    /** Real path of every logical path already resolved */
    private readonly realByLogical = new Map<string, string>();
    private readonly uniqueFiles = new Set<string>();
    private readonly edges: ImportEdge[] = [];
    private readonly diagnostics: ExpansionDiagnostic[] = [];
    private emittedBytes = 0;

    constructor(
        limits: ExpansionLimits,
        rootReal: string,
        fileSystem: ImportFileSystem,
    ) {
        this.limits = limits;
        this.rootReal = rootReal;
        this.fileSystem = fileSystem;
    }

    /** Every spelling of the repository root an absolute import may use. */
    rootSpellings(repoRoot: string): readonly string[] {
        return [repoRoot, this.rootReal];
    }

    get edgeCount(): number {
        return this.edges.length;
    }

    get remainingEmitBudget(): number {
        return this.limits.maxEmittedBytes - this.emittedBytes;
    }

    isEmitBudgetExhausted(): boolean {
        return this.emittedBytes >= this.limits.maxEmittedBytes;
    }

    snapshot(): {
        edges: readonly ImportEdge[];
        diagnostics: readonly ExpansionDiagnostic[];
    } {
        return {
            edges: [...this.edges],
            diagnostics: [...this.diagnostics],
        };
    }

    recordEdge(edge: ImportEdge): void {
        this.edges.push(edge);
        // Failures always carry ruleId; resolved edges do not.
        if (!edge.ruleId) {
            return;
        }
        this.diagnostics.push({
            ruleId: edge.ruleId,
            message: messageForFailure(edge.status, edge.rawTarget),
            filePath: edge.importer,
            range: edge.tokenRange,
        });
    }

    recordFailure(
        importer: string,
        token: ImportToken,
        status: ImportEdgeStatus,
        target?: string,
    ): void {
        this.recordEdge({
            importer,
            tokenRange: { start: token.start, end: token.end },
            rawTarget: token.rawTarget,
            target,
            status,
            ruleId: ruleIdForStatus(status),
        });
    }

    recordResolved(importer: string, token: ImportToken, target: string): void {
        this.recordEdge({
            importer,
            tokenRange: { start: token.start, end: token.end },
            rawTarget: token.rawTarget,
            target,
            status: "resolved",
        });
    }

    /**
     * Emit up to `text` against the remaining byte budget.
     * Returns emitted text (possibly clipped) and whether the full text fit.
     */
    takeEmitBudget(text: string): { emitted: string; complete: boolean } {
        if (text.length === 0) {
            return { emitted: "", complete: true };
        }
        const room = this.remainingEmitBudget;
        if (room <= 0) {
            return { emitted: "", complete: false };
        }
        if (text.length <= room) {
            this.emittedBytes += text.length;
            return { emitted: text, complete: true };
        }
        this.emittedBytes += room;
        return { emitted: text.slice(0, room), complete: false };
    }

    /**
     * Resolves a logical repository-relative path to a real file inside the
     * repository (following symlinks that stay inside it) and reads it. A
     * file is identified by its real path everywhere: content, the unique-file
     * budget, cycle detection and the base for the imports it contains.
     */
    async readFile(
        repoRoot: string,
        relativePath: string,
    ): Promise<ReadFileResult> {
        const known = this.realByLogical.get(relativePath);
        const knownContent =
            known === undefined ? undefined : this.contentByReal.get(known);
        if (known !== undefined && knownContent !== undefined) {
            return { ok: true, content: knownContent, real: known };
        }

        const located = await this.locate(repoRoot, relativePath);
        if (!located.ok) {
            return located;
        }

        const isNewUnique = !this.uniqueFiles.has(located.real);
        if (
            isNewUnique &&
            this.uniqueFiles.size >= this.limits.maxUniqueFiles
        ) {
            return { ok: false, status: "size-exceeded" };
        }

        const cached = this.contentByReal.get(located.real);
        const content = cached ?? (await this.readLocated(located));
        if (typeof content !== "string") {
            return content;
        }

        this.contentByReal.set(located.real, content);
        this.uniqueFiles.add(located.real);
        this.realByLogical.set(relativePath, located.real);
        return { ok: true, content, real: located.real };
    }

    private async locate(
        repoRoot: string,
        relativePath: string,
    ): Promise<LocatedFile | { ok: false; status: ImportEdgeStatus }> {
        let absolutePath: string;
        try {
            absolutePath = await resolvePathWithinRoot(repoRoot, relativePath);
        } catch (error: unknown) {
            return { ok: false, status: classifyPathError(error) };
        }

        const inspection = await this.fileSystem.inspect(
            this.rootReal,
            absolutePath,
        );
        return toLocatedFile(this.rootReal, inspection);
    }

    private async readLocated(
        located: LocatedFile,
    ): Promise<string | { ok: false; status: ImportEdgeStatus }> {
        const outcome = await this.fileSystem.read(
            located.realAbsolute,
            this.limits.maxFileBytes,
            located.identity,
        );
        return outcome.ok
            ? outcome.content
            : { ok: false, status: statusForReadFailure(outcome.reason) };
    }
}

class ContentBuilder {
    private outputText = "";
    private readonly builtSegments: EffectiveSegment[] = [];

    get output(): string {
        return this.outputText;
    }

    get length(): number {
        return this.outputText.length;
    }

    get segments(): readonly EffectiveSegment[] {
        return this.builtSegments;
    }

    appendLiteral(
        sourcePath: string,
        sourceStart: number,
        text: string,
        importChain: readonly string[],
    ): void {
        const segment = createLiteralSegment(
            this.outputText.length,
            sourcePath,
            sourceStart,
            text,
            importChain,
        );
        if (!segment) {
            return;
        }
        this.builtSegments.push(segment);
        this.outputText += text;
    }

    appendExpanded(
        content: string,
        segments: readonly EffectiveSegment[],
    ): void {
        this.outputText += content;
        this.builtSegments.push(...segments);
    }

    toResult(): ExpandResult {
        return {
            content: this.outputText,
            segments: [...this.builtSegments],
        };
    }
}

function emitSourceSlice(
    session: ExpansionSession,
    builder: ContentBuilder,
    sourcePath: string,
    content: string,
    from: number,
    to: number,
    importChain: readonly string[],
): boolean {
    if (to <= from) {
        return true;
    }
    const { emitted, complete } = session.takeEmitBudget(
        content.slice(from, to),
    );
    builder.appendLiteral(sourcePath, from, emitted, importChain);
    return complete;
}

async function expandToken(
    session: ExpansionSession,
    repoRoot: string,
    importerPath: string,
    token: ImportToken,
    hop: number,
    stack: readonly string[],
    importChain: readonly string[],
    outputOffset: number,
): Promise<TokenExpansion> {
    if (session.edgeCount >= session.limits.maxEdges) {
        session.recordFailure(importerPath, token, "size-exceeded");
        return { kind: "unexpanded" };
    }

    const nextHop = hop + 1;
    if (nextHop > session.limits.maxDepth) {
        session.recordFailure(importerPath, token, "depth-exceeded");
        return { kind: "unexpanded" };
    }

    const normalized = normalizeRelativeWithinRoot(
        importerPath,
        token.rawTarget,
        session.rootSpellings(repoRoot),
    );
    if (!normalized.ok) {
        session.recordFailure(importerPath, token, normalized.status);
        return { kind: "unexpanded" };
    }

    const targetPath = normalized.relativePath;
    const readResult = await session.readFile(repoRoot, targetPath);
    if (!readResult.ok) {
        session.recordFailure(
            importerPath,
            token,
            readResult.status,
            targetPath,
        );
        return { kind: "unexpanded" };
    }

    // From here the target is identified by its real path, so two symlinks to
    // one file are one node of the import graph and a symlink that leads back
    // to an importer is a cycle.
    const targetReal = readResult.real;
    if (stack.includes(targetReal)) {
        session.recordFailure(importerPath, token, "cycle", targetReal);
        return { kind: "unexpanded" };
    }

    if (session.isEmitBudgetExhausted()) {
        session.recordFailure(importerPath, token, "size-exceeded", targetReal);
        return { kind: "unexpanded" };
    }

    const child = await expandContent(
        session,
        repoRoot,
        targetReal,
        readResult.content,
        nextHop,
        [...stack, targetReal],
        [...importChain, targetReal],
    );

    session.recordResolved(importerPath, token, targetReal);
    return {
        kind: "expanded",
        content: child.content,
        segments: rebaseSegments(child.segments, outputOffset),
    };
}

async function expandContent(
    session: ExpansionSession,
    repoRoot: string,
    sourcePath: string,
    content: string,
    hop: number,
    stack: readonly string[],
    importChain: readonly string[],
): Promise<ExpandResult> {
    const tokens = findImportTokens(content);
    const builder = new ContentBuilder();
    let cursor = 0;

    for (const token of tokens) {
        const literalOk = emitSourceSlice(
            session,
            builder,
            sourcePath,
            content,
            cursor,
            token.start,
            importChain,
        );
        if (!literalOk) {
            session.recordFailure(sourcePath, token, "size-exceeded");
            emitSourceSlice(
                session,
                builder,
                sourcePath,
                content,
                token.start,
                content.length,
                importChain,
            );
            return builder.toResult();
        }

        const expansion = await expandToken(
            session,
            repoRoot,
            sourcePath,
            token,
            hop,
            stack,
            importChain,
            builder.length,
        );

        if (expansion.kind === "expanded") {
            builder.appendExpanded(expansion.content, expansion.segments);
        } else {
            const tokenOk = emitSourceSlice(
                session,
                builder,
                sourcePath,
                content,
                token.start,
                token.end,
                importChain,
            );
            if (!tokenOk) {
                return builder.toResult();
            }
        }

        cursor = token.end;
    }

    emitSourceSlice(
        session,
        builder,
        sourcePath,
        content,
        cursor,
        content.length,
        importChain,
    );
    return builder.toResult();
}

/**
 * Build an ordered effective document by expanding verified Claude `@` imports.
 */
export async function buildEffectiveDocument(
    input: BuildEffectiveDocumentInput,
): Promise<EffectiveDocument> {
    const limits = resolveLimits(input.limits);
    const rootRelativePath = toPosixRelative(normalize(input.rootRelativePath));

    if (isUnsafeRootPath(rootRelativePath)) {
        throw new Error(
            `Root path is outside repository root: ${input.rootRelativePath}`,
        );
    }

    const rootReal = await realpath(input.repoRoot).catch(() => null);
    if (rootReal === null) {
        throw new Error(
            `Unable to read root instruction file ${rootRelativePath}: unresolved`,
        );
    }

    const session = new ExpansionSession(limits, rootReal, {
        ...nodeImportFileSystem,
        ...input.fileSystem,
    });
    const rootRead = await session.readFile(input.repoRoot, rootRelativePath);
    if (!rootRead.ok) {
        throw new Error(
            `Unable to read root instruction file ${rootRelativePath}: ${rootRead.status}`,
        );
    }

    const expanded = await expandContent(
        session,
        input.repoRoot,
        rootRead.real,
        rootRead.content,
        0,
        [rootRead.real],
        [rootRead.real],
    );
    const snapshot = session.snapshot();

    return {
        root: rootRelativePath,
        content: expanded.content,
        orderedSegments: expanded.segments,
        edges: snapshot.edges,
        expansionDiagnostics: snapshot.diagnostics,
    };
}
