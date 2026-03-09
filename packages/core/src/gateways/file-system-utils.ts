/**
 * Shared file system utilities for gateways.
 */

import { access, lstat, realpath, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

/**
 * Checks if a file or directory exists.
 */
export async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
    return (
        candidatePath === rootPath ||
        candidatePath.startsWith(`${rootPath}${sep}`)
    );
}

/**
 * Resolves a relative path under targetDir and rejects traversal outside the root.
 */
export async function resolvePathWithinRoot(
    targetDir: string,
    relativePath: string,
): Promise<string> {
    if (!relativePath) {
        throw new Error("Path must not be empty");
    }

    const rootPath = await realpath(targetDir);
    const resolvedPath = resolve(rootPath, relativePath);

    if (!isPathWithinRoot(rootPath, resolvedPath)) {
        throw new Error(
            `Resolved path is outside target directory: ${relativePath}`,
        );
    }

    return resolvedPath;
}

/**
 * Ensures existing path segments under targetDir are not symbolic links.
 */
export async function assertPathHasNoSymbolicLinks(
    targetDir: string,
    absolutePath: string,
): Promise<void> {
    const rootPath = await realpath(targetDir);

    if (!isPathWithinRoot(rootPath, absolutePath)) {
        throw new Error(
            `Resolved path is outside target directory: ${absolutePath}`,
        );
    }

    const relativePath = relative(rootPath, absolutePath);
    if (!relativePath || relativePath === ".") {
        return;
    }

    const segments = relativePath.split(sep);
    let currentPath = rootPath;

    for (const segment of segments) {
        currentPath = join(currentPath, segment);

        try {
            const stats = await lstat(currentPath);
            if (stats.isSymbolicLink()) {
                throw new Error(`Path contains symbolic link: ${currentPath}`);
            }
        } catch (error) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                return;
            }
            throw error;
        }
    }
}

/**
 * Resolves a relative path under targetDir and validates it does not pass through symlinks.
 */
export async function resolveSafePath(
    targetDir: string,
    relativePath: string,
): Promise<string> {
    const resolvedPath = await resolvePathWithinRoot(targetDir, relativePath);
    await assertPathHasNoSymbolicLinks(targetDir, resolvedPath);
    return resolvedPath;
}

/**
 * Enforces a maximum file size before reading/parsing.
 */
export async function assertFileSizeWithinLimit(
    filePath: string,
    maxBytes: number,
    context: string,
): Promise<void> {
    const fileStats = await stat(filePath);
    if (fileStats.size > maxBytes) {
        throw new Error(
            `${context} exceeds size limit (${fileStats.size} bytes > ${maxBytes} bytes)`,
        );
    }
}
