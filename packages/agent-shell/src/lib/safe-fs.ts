import { FsSafeError, root } from "@openclaw/fs-safe";
import type { DirEntry } from "@openclaw/fs-safe/types";

export interface SafeDirEntry {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
}

export interface SafePathStat {
    readonly isDirectory: boolean;
    readonly isFile: boolean;
    readonly mtimeMs: number;
    readonly size: number;
}

function mapFsSafeError(error: unknown, relativePath: string): never {
    if (error instanceof FsSafeError) {
        switch (error.code) {
            case "outside-workspace":
            case "invalid-path":
                throw new Error(
                    `Resolved path is outside target directory: ${relativePath}`,
                    { cause: error },
                );
            case "path-alias":
            case "symlink":
                throw new Error(
                    `Symlinks are not allowed: path contains symbolic link: ${relativePath}`,
                    { cause: error },
                );
            case "too-large":
                throw new Error(
                    `File ${relativePath} exceeds size limit: ${error.message}`,
                    { cause: error },
                );
            default:
                throw error;
        }
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

function toSafeDirEntry(entry: DirEntry): SafeDirEntry {
    return {
        name: entry.name,
        isDirectory: () => entry.isDirectory,
        isFile: () => entry.isFile,
        isSymbolicLink: () => entry.isSymbolicLink,
    };
}

export async function readBytesWithinRoot(
    targetDir: string,
    relativePath: string,
    maxBytes: number,
): Promise<Buffer> {
    try {
        const safeRoot = await createSafeRoot(targetDir, maxBytes);
        return await safeRoot.readBytes(relativePath, { maxBytes });
    } catch (error: unknown) {
        mapFsSafeError(error, relativePath);
    }
}

export async function readTextWithinRoot(
    targetDir: string,
    relativePath: string,
    maxBytes: number,
): Promise<string> {
    try {
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
        const safeRoot = await createSafeRoot(targetDir);
        const entries = await safeRoot.list(relativePath, {
            withFileTypes: true,
        });
        return entries.map(toSafeDirEntry);
    } catch (error: unknown) {
        mapFsSafeError(error, relativePath);
    }
}

export async function statWithinRoot(
    targetDir: string,
    relativePath: string,
): Promise<SafePathStat> {
    try {
        const safeRoot = await createSafeRoot(targetDir);
        return await safeRoot.stat(relativePath);
    } catch (error: unknown) {
        mapFsSafeError(error, relativePath);
    }
}

export async function pathExistsWithinRoot(
    targetDir: string,
    relativePath: string,
): Promise<boolean> {
    try {
        const safeRoot = await createSafeRoot(targetDir);
        return await safeRoot.exists(relativePath);
    } catch (error: unknown) {
        mapFsSafeError(error, relativePath);
    }
}
