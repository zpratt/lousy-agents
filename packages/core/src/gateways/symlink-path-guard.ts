/**
 * Path-segment symlink rejection helpers for root-bounded FS ops.
 */

import { lstat } from "node:fs/promises";
import { join, sep } from "node:path";
import { FsSafeError } from "@openclaw/fs-safe";

function isEnoentError(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function symlinkNotAllowedError(relativePath: string): Error {
    return new Error(
        `Symlinks are not allowed: path contains symbolic link: ${JSON.stringify(relativePath)}`,
        { cause: new FsSafeError("symlink", "symlink not allowed") },
    );
}

async function lstatIfExists(path: string) {
    try {
        return await lstat(path);
    } catch (error: unknown) {
        if (isEnoentError(error)) {
            return undefined;
        }
        throw error;
    }
}

/**
 * Walk path segments under rootPath and reject any symbolic-link component.
 * Stops at the first missing segment (ENOENT).
 */
export async function rejectSymlinkSegments(
    rootPath: string,
    relativeFromRoot: string,
    onSymlink: (segmentPath: string) => Error,
): Promise<void> {
    if (!relativeFromRoot) {
        return;
    }

    let currentPath = rootPath;
    for (const segment of relativeFromRoot.split(sep)) {
        if (!segment || segment === ".") {
            continue;
        }
        currentPath = join(currentPath, segment);
        const stats = await lstatIfExists(currentPath);
        if (stats === undefined) {
            return;
        }
        if (stats.isSymbolicLink()) {
            throw onSymlink(currentPath);
        }
    }
}
