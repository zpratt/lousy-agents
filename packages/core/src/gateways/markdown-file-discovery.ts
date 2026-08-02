/**
 * Shared recursive markdown-file discovery for lint gateways that scan a
 * catalog root directory for `.md` files (agents, subagents). Guards
 * against path traversal and symlink escapes, and caps recursion depth to
 * avoid stack exhaustion on pathologically deep directory trees.
 */

import { join, relative, resolve, sep } from "node:path";
import {
    listDirectoryWithinRoot,
    pathExistsWithinRoot,
    type SafeDirEntry,
} from "./file-system-utils.js";

/** Maximum subdirectory nesting the walk will descend into. */
const MAX_WALK_DEPTH = 32;

export interface DiscoveredMarkdownFile {
    readonly filePath: string;
    readonly name: string;
}

function isUnsafeEntryName(name: string): boolean {
    return name.includes("..") || name.includes("/") || name.includes("\\");
}

function isWithinResolvedRoot(
    resolvedRootDir: string,
    absoluteEntryPath: string,
): boolean {
    const resolvedPath = resolve(absoluteEntryPath);
    const rel = relative(resolvedRootDir, resolvedPath);
    return !rel.startsWith("..") && !rel.startsWith(sep);
}

async function rootExists(
    targetDir: string,
    rootDir: string,
): Promise<boolean> {
    try {
        return await pathExistsWithinRoot(targetDir, rootDir);
    } catch {
        return false;
    }
}

function isDiscoverableMarkdownFile(
    entry: SafeDirEntry,
    name: string,
): boolean {
    return entry.isFile() && name.endsWith(".md");
}

async function collectEntryFiles(
    targetDir: string,
    resolvedRootDir: string,
    dir: string,
    depth: number,
    entry: SafeDirEntry,
    deriveName: (filename: string) => string,
): Promise<DiscoveredMarkdownFile[]> {
    const name = entry.name;
    if (isUnsafeEntryName(name)) {
        return [];
    }

    const entryPath = join(dir, name);
    const absoluteEntryPath = join(targetDir, entryPath);
    if (!isWithinResolvedRoot(resolvedRootDir, absoluteEntryPath)) {
        return [];
    }

    if (entry.isSymbolicLink()) {
        return [];
    }

    if (entry.isDirectory()) {
        return walkMarkdownFiles(
            targetDir,
            resolvedRootDir,
            entryPath,
            depth + 1,
            deriveName,
        );
    }

    if (!isDiscoverableMarkdownFile(entry, name)) {
        return [];
    }

    return [
        {
            filePath: absoluteEntryPath,
            name: deriveName(name),
        },
    ];
}

async function walkMarkdownFiles(
    targetDir: string,
    resolvedRootDir: string,
    dir: string,
    depth: number,
    deriveName: (filename: string) => string,
): Promise<DiscoveredMarkdownFile[]> {
    if (depth > MAX_WALK_DEPTH) {
        return [];
    }

    const entries = await listDirectoryWithinRoot(targetDir, dir);
    const discovered: DiscoveredMarkdownFile[] = [];

    for (const entry of entries) {
        const files = await collectEntryFiles(
            targetDir,
            resolvedRootDir,
            dir,
            depth,
            entry,
            deriveName,
        );
        discovered.push(...files);
    }

    return discovered;
}

/**
 * Recursively discovers `.md` files under `rootDir` (relative to
 * `targetDir`). `deriveName` maps a filename to the construct name callers
 * use to identify the file (e.g. stripping `.md` or `.agent.md`).
 */
export async function discoverMarkdownFiles(
    targetDir: string,
    rootDir: string,
    deriveName: (filename: string) => string,
): Promise<DiscoveredMarkdownFile[]> {
    if (!(await rootExists(targetDir, rootDir))) {
        return [];
    }

    return walkMarkdownFiles(
        targetDir,
        resolve(targetDir, rootDir),
        rootDir,
        0,
        deriveName,
    );
}
