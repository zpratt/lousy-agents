/**
 * Path-segment symlink rejection for root-bounded FS ops.
 */

import { lstat, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { FsSafeError } from "@openclaw/fs-safe";

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
    if (candidatePath === rootPath) {
        return true;
    }
    // When root is `/` (or `C:\`), appending sep would yield `//` / `C:\\` and
    // incorrectly reject every in-root path. Use root as the prefix when it
    // already ends with the separator.
    const prefix = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
    return candidatePath.startsWith(prefix);
}

function isEnoentError(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function symlinkNotAllowedError(relativePath: string): Error {
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

async function rejectSymlinkSegments(
    rootPath: string,
    relativeFromRoot: string,
    relativePath: string,
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
            throw symlinkNotAllowedError(relativePath);
        }
    }
}

/**
 * fs-safe 0.5 exists/stat/list canonicalize through in-root symlinks; open/read
 * still honor symlinks:"reject". Enforce reject on every root-bounded op.
 */
export async function assertNoSymlinksWithinRoot(
    targetDir: string,
    relativePath: string,
): Promise<void> {
    if (!relativePath) {
        return;
    }

    const rootPath = await realpath(targetDir);
    const absolutePath = resolve(rootPath, relativePath);
    if (!isPathWithinRoot(rootPath, absolutePath)) {
        throw new Error(
            `Resolved path is outside target directory: ${relativePath}`,
        );
    }

    await rejectSymlinkSegments(
        rootPath,
        relative(rootPath, absolutePath),
        relativePath,
    );
}
