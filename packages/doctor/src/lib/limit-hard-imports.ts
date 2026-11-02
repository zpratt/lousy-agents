import type { RawEdge } from "./edge-parser.js";

export interface LimitedEdges {
    readonly edges: RawEdge[];
    /** Whether hard imports past the limit were left out */
    readonly overLimit: boolean;
}

/**
 * Keeps the first `max` hard imports of a file, in the order written, with
 * every soft reference and glob binding. Every `@` token counts, including
 * one that is not clearly a path, so the work a file can cost is bounded by
 * the limit and not by its size; only hard imports cost a file check.
 */
export function limitHardImports(
    edges: readonly RawEdge[],
    max: number,
): LimitedEdges {
    let hardImports = 0;
    let overLimit = false;
    const kept = edges.filter((edge) => {
        if (edge.type !== "hard-import") {
            return true;
        }
        hardImports += 1;
        if (hardImports > max) {
            overLimit = true;
            return false;
        }
        return true;
    });
    return { edges: kept, overLimit };
}
