/**
 * Shared file system utilities for gateways.
 */

import { access, realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { FsSafeError, root } from "@openclaw/fs-safe";
import type { DirEntry } from "@openclaw/fs-safe/types";
import { readFileNoFollow } from "./read-file-no-follow.js";
import {
    rejectSymlinkSegments,
    symlinkNotAllowedError,
} from "./symlink-path-guard.js";

export { readFileNoFollow };

export interface SafeDirEntry {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
}

export interface SafePathStat {
    readonly isDirectory: boolean;
    readonly isFile: boolean;
    readonly isSymbolicLink: boolean;
    readonly mtimeMs: number;
    readonly size: number;
}

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
    if (candidatePath === rootPath) {
        return true;
    }
    // When root is `/` (or `C:\`), appending sep would yield `//` / `C:\\` and
    // incorrectly reject every in-root path. Use root as the prefix when it
    // already ends with the separator.
    const prefix = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
    return candidatePath.startsWith(prefix);
}

function mapFsSafeError(error: unknown, relativePath: string): never {
    if (!(error instanceof FsSafeError)) {
        throw error;
    }

    const safePath = JSON.stringify(relativePath);

    if (error.code === "outside-workspace" || error.code === "invalid-path") {
        throw new Error(
            `Resolved path is outside target directory: ${safePath}`,
            { cause: error },
        );
    }
    if (error.code === "path-alias" || error.code === "symlink") {
        throw new Error(
            `Symlinks are not allowed: path contains symbolic link: ${safePath}`,
            { cause: error },
        );
    }
    if (error.code === "too-large") {
        throw new Error(
            `File ${safePath} exceeds size limit: ${error.message}`,
            { cause: error },
        );
    }
    throw error;
}

async function createSafeRoot(targetDir: string, maxBytes?: number) {
    return root(targetDir, {
        hardlinks: "reject",
        maxBytes,
        symlinks: "reject",
    });
}

/**
 * fs-safe 0.5 exists/stat/list canonicalize through in-root symlinks; open/read
 * still honor symlinks:"reject". Enforce reject on every root-bounded op.
 */
async function assertNoSymlinksWithinRoot(
    targetDir: string,
    relativePath: string,
): Promise<void> {
    if (!relativePath) {
        return;
    }

    const absolutePath = await resolvePathWithinRoot(targetDir, relativePath);
    const rootPath = await realpath(targetDir);
    await rejectSymlinkSegments(
        rootPath,
        relative(rootPath, absolutePath),
        () => symlinkNotAllowedError(relativePath),
    );
}

export async function readTextWithinRoot(
    targetDir: string,
    relativePath: string,
    maxBytes: number,
): Promise<string> {
    try {
        await assertNoSymlinksWithinRoot(targetDir, relativePath);
        const safeRoot = await createSafeRoot(targetDir, maxBytes);
        return await safeRoot.readText(relativePath, { maxBytes });
    } catch (error: unknown) {
        mapFsSafeError(error, relativePath);
    }
}

export async function listDirectoryWithinRoot(
    targetDir: string,
    relativePath: string,
): Promise<SafeDirEntry[]> {
    try {
        await assertNoSymlinksWithinRoot(targetDir, relativePath);
        const safeRoot = await createSafeRoot(targetDir);
        const entries = await safeRoot.list(relativePath, {
            withFileTypes: true,
        });
        return entries.map(toSafeDirEntry);
    } catch (error: unknown) {
        mapFsSafeError(error, relativePath);
    }
}

function toSafeDirEntry(entry: DirEntry): SafeDirEntry {
    return {
        name: entry.name,
        isDirectory: () => entry.isDirectory,
        isFile: () => entry.isFile,
        isSymbolicLink: () => entry.isSymbolicLink,
    };
}

export async function pathExistsWithinRoot(
    targetDir: string,
    relativePath: string,
): Promise<boolean> {
    try {
        await assertNoSymlinksWithinRoot(targetDir, relativePath);
        const safeRoot = await createSafeRoot(targetDir);
        return await safeRoot.exists(relativePath);
    } catch (error: unknown) {
        mapFsSafeError(error, relativePath);
    }
}

/**
 * Returns true if the error originated from an fs-safe security check
 * (symlink, traversal, or size-limit violation). These errors carry a
 * FsSafeError as their `cause` and should be re-thrown rather than
 * silently swallowed by per-file error handlers.
 */
export function isFsSafeViolation(error: unknown): boolean {
    return error instanceof Error && error.cause instanceof FsSafeError;
}

export async function statWithinRoot(
    targetDir: string,
    relativePath: string,
): Promise<SafePathStat> {
    try {
        await assertNoSymlinksWithinRoot(targetDir, relativePath);
        const safeRoot = await createSafeRoot(targetDir);
        return await safeRoot.stat(relativePath);
    } catch (error: unknown) {
        mapFsSafeError(error, relativePath);
    }
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

    await rejectSymlinkSegments(
        rootPath,
        relative(rootPath, absolutePath),
        (segmentPath) =>
            new Error(`Path contains symbolic link: ${segmentPath}`),
    );
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
