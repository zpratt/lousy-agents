import { dirname, relative, resolve, sep } from "node:path";
import { resolveRealPathWithinRoot } from "@lousy-agents/core/gateways/real-path-within-root.js";
import { normalizeRelativeWithinRoot } from "@lousy-agents/core/lib/instruction-import-expand.js";
import type { Edge, EdgeMalformedReason } from "../entities/edge-types.js";
import type { RawEdge } from "../lib/edge-parser.js";

export interface EdgeResolutionContext {
    readonly repoRoot: string;
    readonly rootReal: string;
    readonly existingAbsPaths: Set<string>;
}

function malformedEdge(
    type: Edge["type"],
    from: string,
    target: string,
    reason: EdgeMalformedReason,
): Edge {
    return {
        type,
        direction: { from, to: target },
        target,
        malformed: true,
        reason,
    };
}

function wellFormedEdge(
    type: Edge["type"],
    from: string,
    target: string,
): Edge {
    return {
        type,
        direction: { from, to: target },
        target,
        malformed: false,
    };
}

const HARD_IMPORT_REASON_BY_STATUS: Partial<
    Record<string, EdgeMalformedReason>
> = {
    home: "home",
    absolute: "absolute",
    escape: "path-traversal",
};

/**
 * Resolves a Claude `@path` import with the same target rules as core import
 * expansion: home-directory, absolute, and escaping targets are rejected, and
 * any regular file inside the repository (not only scannable files) resolves.
 */
async function resolveHardImportEdge(
    raw: RawEdge,
    from: string,
    importerRealPath: string,
    ctx: EdgeResolutionContext,
): Promise<Edge | null> {
    const rawTarget = raw.rawTarget;
    // Claude Code resolves a relative import from the importing file's real
    // directory, so the base is the real path, not the symlink's location.
    const normalized = normalizeRelativeWithinRoot(
        importerRealPath,
        rawTarget,
        [ctx.repoRoot, ctx.rootReal],
    );
    if (!normalized.ok) {
        return malformedEdge(
            "hard-import",
            from,
            rawTarget,
            HARD_IMPORT_REASON_BY_STATUS[normalized.status] ?? "missing-target",
        );
    }

    const targetAbs = resolve(ctx.repoRoot, normalized.relativePath);
    const exists =
        ctx.existingAbsPaths.has(targetAbs) ||
        (await resolveRealPathWithinRoot(ctx.rootReal, targetAbs))?.kind ===
            "file";

    if (exists) {
        return wellFormedEdge("hard-import", from, normalized.relativePath);
    }
    // A token such as `@types/node` that is not clearly a path and does not
    // resolve is not an import at all, so it is not a broken one either.
    return raw.speculative === true
        ? null
        : malformedEdge(
              "hard-import",
              from,
              normalized.relativePath,
              "missing-target",
          );
}

function resolveSoftReferenceEdge(
    rawTarget: string,
    sourceAbsPath: string,
    from: string,
    ctx: EdgeResolutionContext,
): Edge {
    const resolvedAbs = resolve(dirname(sourceAbsPath), rawTarget);
    const absoluteRoot = resolve(ctx.repoRoot);

    const isWithinRoot =
        resolvedAbs === absoluteRoot ||
        resolvedAbs.startsWith(`${absoluteRoot}${sep}`);

    if (!isWithinRoot) {
        return malformedEdge(
            "soft-reference",
            from,
            rawTarget,
            "path-traversal",
        );
    }

    const relativeTarget = relative(absoluteRoot, resolvedAbs).replace(
        /\\/g,
        "/",
    );

    return ctx.existingAbsPaths.has(resolvedAbs)
        ? wellFormedEdge("soft-reference", from, relativeTarget)
        : malformedEdge(
              "soft-reference",
              from,
              relativeTarget,
              "missing-target",
          );
}

/**
 * Resolves a parsed edge to an inventory edge, or to null when it is an `@`
 * token that is not clearly a path and does not resolve to a file.
 *
 * @param sourceRealRelPath Repository-relative path of the source file's real
 * (symlink-free) location, the base for its `@` imports
 */
export async function resolveEdge(
    raw: RawEdge,
    sourceAbsPath: string,
    sourceRealRelPath: string,
    ctx: EdgeResolutionContext,
): Promise<Edge | null> {
    const { rawTarget, type } = raw;
    const from = relative(ctx.repoRoot, sourceAbsPath).replace(/\\/g, "/");

    switch (type) {
        case "glob-binding":
            return wellFormedEdge(type, from, rawTarget);
        case "hard-import":
            return resolveHardImportEdge(raw, from, sourceRealRelPath, ctx);
        case "soft-reference":
            return resolveSoftReferenceEdge(
                rawTarget,
                sourceAbsPath,
                from,
                ctx,
            );
    }
}
