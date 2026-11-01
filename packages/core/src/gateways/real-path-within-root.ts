/**
 * Shared symlink policy for discovering agentic files (instruction files,
 * doctor scan targets): follow a symlink only when its real target stays
 * inside the repository.
 */

import { realpath, stat } from "node:fs/promises";
import { isPathWithinRoot } from "./file-system-utils.js";
import type { FileIdentity } from "./read-regular-file-no-follow.js";

/**
 * The real location of a path whose target stays inside the root.
 */
export interface RealPathWithinRoot {
    readonly kind: "file" | "directory";
    readonly real: string;
}

/**
 * The outcome of following a path to its real location within a root.
 */
export type PathInspection =
    | {
          readonly status: "ok";
          readonly kind: "file" | "directory";
          readonly real: string;
          /** Identity of the real path when it was checked */
          readonly identity: FileIdentity;
      }
    | { readonly status: "missing" }
    | { readonly status: "outside-root" }
    | { readonly status: "unsupported" };

function isMissingError(error: unknown): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTDIR")
    );
}

/**
 * Follows a path (and any symlink along it) to its real location and reports
 * why it cannot be used: missing, outside the real root, or neither a regular
 * file nor a directory. Stats the already-resolved real path (rather than
 * re-resolving the symlink) so the within-root check, the type check and the
 * recorded identity observe the same target.
 *
 * @param rootReal Real (symlink-free) path of the root directory
 * @param absolutePath Path to resolve, which may contain symlinks
 */
export async function inspectPathWithinRoot(
    rootReal: string,
    absolutePath: string,
): Promise<PathInspection> {
    try {
        const real = await realpath(absolutePath);
        if (!isPathWithinRoot(rootReal, real)) {
            return { status: "outside-root" };
        }

        const targetStat = await stat(real);
        const identity = { dev: targetStat.dev, ino: targetStat.ino };
        if (targetStat.isDirectory()) {
            return { status: "ok", kind: "directory", real, identity };
        }
        if (targetStat.isFile()) {
            return { status: "ok", kind: "file", real, identity };
        }
        return { status: "unsupported" };
    } catch (error: unknown) {
        return { status: isMissingError(error) ? "missing" : "unsupported" };
    }
}

/**
 * Shared symlink policy for discovering agentic files: a path (or any
 * symlink along it) is followed only when its real target stays inside the
 * real root and is a regular file or directory. Callers must still read the
 * content through the real path with the no-follow readers, which reject a
 * symlink swapped in after this check.
 *
 * @param rootReal Real (symlink-free) path of the root directory
 * @param absolutePath Path to resolve, which may contain symlinks
 * @returns The real path and its kind, or null when the target is missing,
 * outside the root, or not a regular file or directory
 */
export async function resolveRealPathWithinRoot(
    rootReal: string,
    absolutePath: string,
): Promise<RealPathWithinRoot | null> {
    const inspection = await inspectPathWithinRoot(rootReal, absolutePath);
    return inspection.status === "ok"
        ? { kind: inspection.kind, real: inspection.real }
        : null;
}
