/**
 * Gateway for discovering instruction files across multiple formats.
 * Supports GitHub Copilot, Claude Code, and community agent instruction formats.
 */

import { realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
    DiscoveredInstructionFile,
    InstructionFileFormat,
} from "../entities/instruction-quality.js";
import { instructionDiscoveryEntries } from "../lib/agentic-location-matchers.js";
import type { InstructionFileDiscoveryGateway } from "../use-cases/analyze-instruction-quality.js";
import { listDirectoryWithinRoot } from "./file-system-utils.js";
import {
    type RealPathWithinRoot,
    resolveRealPathWithinRoot,
} from "./real-path-within-root.js";

// Re-export port type for consumers
export type { InstructionFileDiscoveryGateway };

/** Maximum subdirectory depth walked for directory-prefix entries */
const MAX_SUBDIRECTORY_DEPTH = 10;

/**
 * Discovery state shared by one discoverInstructionFiles call.
 */
interface DiscoveryRoot {
    readonly targetDir: string;
    readonly rootReal: string;
}

/**
 * Settings of one directory-prefix entry walk.
 */
interface DirectoryWalkOptions {
    readonly format: InstructionFileFormat;
    readonly includeSubdirectories: boolean;
}

/**
 * File system implementation of the instruction file discovery gateway.
 *
 * Symlinks follow the shared core policy (resolveRealPathWithinRoot): a
 * symlinked instruction file or directory is discovered only when its real
 * target stays inside the repository. The discovered filePath keeps the
 * location the harness loads; contentPath points at the real file.
 */
export class FileSystemInstructionFileDiscoveryGateway
    implements InstructionFileDiscoveryGateway
{
    async discoverInstructionFiles(
        targetDir: string,
    ): Promise<DiscoveredInstructionFile[]> {
        const rootReal = await realpath(resolve(targetDir)).catch(() => null);
        if (rootReal === null) {
            return [];
        }
        const root: DiscoveryRoot = { targetDir, rootReal };
        const files: DiscoveredInstructionFile[] = [];

        for (const entry of instructionDiscoveryEntries()) {
            const format = entry.instructionFormat;
            if (format == null) {
                continue;
            }

            if (entry.matchKind === "exact") {
                files.push(
                    ...(await discoverExactFile(root, entry.path, format)),
                );
                continue;
            }

            const walk = createDirectoryWalk(root, {
                format,
                includeSubdirectories: entry.includeSubdirectories === true,
            });
            files.push(...(await walk(entry.path)));
        }

        return files;
    }
}

/**
 * Discovers one exact-path instruction file, or nothing when it is missing
 * or resolves outside the root.
 */
async function discoverExactFile(
    root: DiscoveryRoot,
    relativePosixPath: string,
    format: InstructionFileFormat,
): Promise<DiscoveredInstructionFile[]> {
    const resolved = await resolveRealPathWithinRoot(
        root.rootReal,
        join(root.targetDir, ...relativePosixPath.split("/")),
    );
    return resolved?.kind === "file"
        ? [toDiscoveredFile(root, relativePosixPath, resolved, format)]
        : [];
}

/**
 * Returns true when a directory entry name could escape its directory.
 */
function isUnsafeEntryName(name: string): boolean {
    return name.includes("..") || name.includes("/") || name.includes("\\");
}

/**
 * Lists a real directory inside the root, or nothing when it cannot be read.
 */
async function listRealDirectory(
    root: DiscoveryRoot,
    dirReal: string,
): Promise<Awaited<ReturnType<typeof listDirectoryWithinRoot>>> {
    try {
        return await listDirectoryWithinRoot(
            root.rootReal,
            relative(root.rootReal, dirReal),
        );
    } catch {
        return [];
    }
}

/**
 * Creates a walk that collects the .md files of a directory-prefix entry.
 * The walk owns its set of visited real directories, so a symlink cycle is
 * listed once.
 */
function createDirectoryWalk(
    root: DiscoveryRoot,
    options: DirectoryWalkOptions,
): (dirRelativePath: string) => Promise<DiscoveredInstructionFile[]> {
    const visitedDirs = new Set<string>();

    const walkEntry = async (
        dirReal: string,
        entryRelativePath: string,
        name: string,
        depth: number,
    ): Promise<DiscoveredInstructionFile[]> => {
        const resolved = await resolveRealPathWithinRoot(
            root.rootReal,
            join(dirReal, name),
        );
        if (resolved?.kind === "file" && name.endsWith(".md")) {
            return [
                toDiscoveredFile(
                    root,
                    entryRelativePath,
                    resolved,
                    options.format,
                ),
            ];
        }
        const descend =
            resolved?.kind === "directory" &&
            options.includeSubdirectories &&
            depth < MAX_SUBDIRECTORY_DEPTH;
        return descend ? walkDirectory(entryRelativePath, depth + 1) : [];
    };

    const walkDirectory = async (
        dirRelativePath: string,
        depth: number,
    ): Promise<DiscoveredInstructionFile[]> => {
        const dir = await resolveRealPathWithinRoot(
            root.rootReal,
            join(root.targetDir, ...dirRelativePath.split("/")),
        );
        if (dir?.kind !== "directory" || visitedDirs.has(dir.real)) {
            return [];
        }
        visitedDirs.add(dir.real);

        const files: DiscoveredInstructionFile[] = [];
        for (const entry of await listRealDirectory(root, dir.real)) {
            if (isUnsafeEntryName(entry.name)) {
                continue;
            }
            files.push(
                ...(await walkEntry(
                    dir.real,
                    `${dirRelativePath}/${entry.name}`,
                    entry.name,
                    depth,
                )),
            );
        }
        return files;
    };

    return (dirRelativePath) => walkDirectory(dirRelativePath, 0);
}

/**
 * Builds the discovered file, adding contentPath when the logical path
 * resolves through a symlink to another file.
 */
function toDiscoveredFile(
    root: DiscoveryRoot,
    relativePosixPath: string,
    resolved: RealPathWithinRoot,
    format: InstructionFileFormat,
): DiscoveredInstructionFile {
    const segments = relativePosixPath.split("/");
    const filePath = join(root.targetDir, ...segments);
    const lexicalReal = join(root.rootReal, ...segments);

    if (resolved.real === lexicalReal) {
        return { filePath, format };
    }

    return {
        filePath,
        format,
        contentPath: join(
            root.targetDir,
            relative(root.rootReal, resolved.real),
        ),
    };
}

/**
 * Creates and returns the default instruction file discovery gateway.
 */
export function createInstructionFileDiscoveryGateway(): InstructionFileDiscoveryGateway {
    return new FileSystemInstructionFileDiscoveryGateway();
}
