/**
 * Atomic file read with symlink and size protection.
 */

import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

function isEloopError(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ELOOP";
}

async function openWithoutFollowingSymlinks(
    filePath: string,
    safePath: string,
) {
    const hasNoFollow =
        typeof constants.O_NOFOLLOW === "number" && constants.O_NOFOLLOW !== 0;

    if (!hasNoFollow) {
        const stats = await lstat(filePath);
        if (stats.isSymbolicLink()) {
            throw new Error(`Symlinks are not allowed: ${safePath}`);
        }
        return open(filePath, constants.O_RDONLY);
    }

    try {
        return await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error: unknown) {
        if (isEloopError(error)) {
            throw new Error(`Symlinks are not allowed: ${safePath}`);
        }
        throw error;
    }
}

/**
 * Reads a file atomically with symlink and size protection.
 *
 * Uses `O_NOFOLLOW` (where available) to atomically reject symlinks at
 * the kernel level, eliminating the TOCTOU window between `lstat()` and
 * `readFile()`. Falls back to `lstat()` on platforms without `O_NOFOLLOW`.
 * Validates file size via `fstat()` on the opened file descriptor so the
 * size check and the read operate on the same inode.
 */
export async function readFileNoFollow(
    filePath: string,
    maxBytes: number,
): Promise<string> {
    const safePath = JSON.stringify(filePath);
    const fh = await openWithoutFollowingSymlinks(filePath, safePath);

    try {
        const fdStats = await fh.stat();
        if (fdStats.size > maxBytes) {
            throw new Error(
                `File ${safePath} exceeds size limit (${fdStats.size} bytes > ${maxBytes} bytes)`,
            );
        }
        return await fh.readFile("utf-8");
    } finally {
        await fh.close();
    }
}
