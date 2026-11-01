/**
 * Gateway for discovering instruction files across multiple formats.
 * Supports GitHub Copilot, Claude Code, and community agent instruction formats.
 */

import { realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
    DiscoveredInstructionFile,
    InstructionDiscoveryDiagnosticSink,
    InstructionFileFormat,
} from "../entities/instruction-quality.js";
import { instructionDiscoveryEntries } from "../lib/agentic-location-matchers.js";
import type { InstructionFileDiscoveryGateway } from "../use-cases/analyze-instruction-quality.js";
import {
    type RealPathWithinRoot,
    resolveRealPathWithinRoot,
} from "./real-path-within-root.js";
import {
    DEFAULT_MAX_WALK_DEPTH,
    DEFAULT_MAX_WALK_DIRECTORIES,
    walkRepository,
} from "./repository-walk.js";

// Re-export port type for consumers
export type { InstructionFileDiscoveryGateway };

/**
 * Discovery state shared by one discoverInstructionFiles call.
 */
interface DiscoveryRoot {
    readonly targetDir: string;
    readonly rootReal: string;
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
    private readonly maxDirectories: number;

    /**
     * @param options.maxDirectories Directories one entry walk lists before it
     * stops; defaults to the shared walk's production limit
     */
    constructor(options: { readonly maxDirectories?: number } = {}) {
        this.maxDirectories =
            options.maxDirectories ?? DEFAULT_MAX_WALK_DIRECTORIES;
    }

    async discoverInstructionFiles(
        targetDir: string,
        onDiagnostic?: InstructionDiscoveryDiagnosticSink,
    ): Promise<DiscoveredInstructionFile[]> {
        const rootReal = await realpath(resolve(targetDir)).catch(() => null);
        if (rootReal === null) {
            return [];
        }
        const root: DiscoveryRoot = { targetDir, rootReal };
        const files: DiscoveredInstructionFile[] = [];
        let directoryLimitReached = false;
        let depthLimitReached = false;

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

            const walked = await walkRepository(targetDir, {
                startRelativePath: entry.path,
                includeFile: isMarkdownFile,
                includeSubdirectories: entry.includeSubdirectories === true,
                revisit: "once-per-real-directory",
                maxDirectories: this.maxDirectories,
            });
            directoryLimitReached =
                directoryLimitReached || walked.directoryLimitReached;
            depthLimitReached = depthLimitReached || walked.depthLimitReached;
            files.push(
                ...walked.files.map((file) =>
                    toDiscoveredFile(
                        root,
                        file.relativePath,
                        { kind: "file", real: file.real },
                        format,
                    ),
                ),
            );
        }

        const reasons = [
            ...(directoryLimitReached
                ? [
                      `Instruction file discovery stopped after listing ${this.maxDirectories} directories, so instruction files in the remaining directories were not analyzed.`,
                  ]
                : []),
            ...(depthLimitReached
                ? [
                      `Instruction file discovery did not go more than ${DEFAULT_MAX_WALK_DEPTH} directories deep, so instruction files in deeper directories were not analyzed.`,
                  ]
                : []),
        ];
        if (reasons.length > 0) {
            onDiagnostic?.({
                ruleId: DISCOVERY_LIMIT_RULE_ID,
                message: reasons.join(" "),
            });
        }

        return files;
    }
}

const DISCOVERY_LIMIT_RULE_ID = "instruction/discovery-limit-reached";

function isMarkdownFile(name: string): boolean {
    return name.endsWith(".md");
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
export function createInstructionFileDiscoveryGateway(options?: {
    readonly maxDirectories?: number;
}): InstructionFileDiscoveryGateway {
    return new FileSystemInstructionFileDiscoveryGateway(options);
}
