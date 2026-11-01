/**
 * Shared symlink policy for discovering agentic files (instruction files,
 * doctor scan targets): follow a symlink only when its real target stays
 * inside the repository.
 */

import { realpath, stat } from "node:fs/promises";
import { isPathWithinRoot } from "./file-system-utils.js";

/**
 * The real location of a path whose target stays inside the root.
 */
export interface RealPathWithinRoot {
    readonly kind: "file" | "directory";
    readonly real: string;
}

/**
 * Shared symlink policy for discovering agentic files: a path (or any
 * symlink along it) is followed only when its real target stays inside the
 * real root and is a regular file or directory. Stats the already-resolved
 * real path (rather than re-resolving the symlink) so the within-root check
 * and the type check observe the same target. Callers must still read the
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
    try {
        const real = await realpath(absolutePath);
        if (!isPathWithinRoot(rootReal, real)) {
            return null;
        }

        const targetStat = await stat(real);
        if (targetStat.isDirectory()) {
            return { kind: "directory", real };
        }
        if (targetStat.isFile()) {
            return { kind: "file", real };
        }
        return null;
    } catch {
        return null;
    }
}
