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
import {
    listDirectoryWithinRoot,
    type RealPathWithinRoot,
    resolveRealPathWithinRoot,
} from "./file-system-utils.js";

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
 * State of one directory-prefix entry walk.
 */
interface DirectoryWalk extends DiscoveryRoot {
    /** Real directories already walked, so a symlink cycle is listed once */
    readonly visitedDirs: Set<string>;
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
                const resolved = await resolveRealPathWithinRoot(
                    rootReal,
                    join(targetDir, ...entry.path.split("/")),
                );
                if (resolved?.kind === "file") {
                    files.push(
                        toDiscoveredFile(root, entry.path, resolved, format),
                    );
                }
                continue;
            }

            await this.discoverMdFilesInDir(
                { ...root, visitedDirs: new Set() },
                entry.path,
                format,
                entry.includeSubdirectories === true,
                files,
                0,
            );
        }

        return files;
    }

    private async discoverMdFilesInDir(
        root: DirectoryWalk,
        dirRelativePath: string,
        format: InstructionFileFormat,
        includeSubdirectories: boolean,
        files: DiscoveredInstructionFile[],
        depth: number,
    ): Promise<void> {
        const dir = await resolveRealPathWithinRoot(
            root.rootReal,
            join(root.targetDir, ...dirRelativePath.split("/")),
        );
        if (dir?.kind !== "directory" || root.visitedDirs.has(dir.real)) {
            return;
        }
        root.visitedDirs.add(dir.real);

        let entries: Awaited<ReturnType<typeof listDirectoryWithinRoot>>;
        try {
            entries = await listDirectoryWithinRoot(
                root.rootReal,
                relative(root.rootReal, dir.real),
            );
        } catch {
            // Skip directory if we can't read it
            return;
        }

        for (const entry of entries) {
            const name = entry.name;
            if (
                name.includes("..") ||
                name.includes("/") ||
                name.includes("\\")
            ) {
                continue;
            }

            const resolved = await resolveRealPathWithinRoot(
                root.rootReal,
                join(dir.real, name),
            );
            const entryRelativePath = `${dirRelativePath}/${name}`;

            if (resolved?.kind === "file" && name.endsWith(".md")) {
                files.push(
                    toDiscoveredFile(root, entryRelativePath, resolved, format),
                );
            } else if (
                resolved?.kind === "directory" &&
                includeSubdirectories &&
                depth < MAX_SUBDIRECTORY_DEPTH
            ) {
                await this.discoverMdFilesInDir(
                    root,
                    entryRelativePath,
                    format,
                    includeSubdirectories,
                    files,
                    depth + 1,
                );
            }
        }
    }
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
