/**
 * Gateway for discovering instruction files across multiple formats.
 * Supports GitHub Copilot, Claude Code, and community agent instruction formats.
 */

import { realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
    type DiscoveryLimitWording,
    describeDiscoveryLimits,
} from "../entities/discovery-limit-message.js";
import type {
    DiscoveredInstructionFile,
    InstructionDiscoveryDiagnosticSink,
    InstructionFileFormat,
} from "../entities/instruction-quality.js";
import { instructionDiscoveryEntries } from "../lib/agentic-location-matchers.js";
import type { InstructionFileDiscoveryGateway } from "../use-cases/analyze-instruction-quality.js";
import {
    inspectPathWithinRoot,
    type RealPathWithinRoot,
} from "./real-path-within-root.js";
import {
    DEFAULT_MAX_WALK_DIRECTORIES,
    type RepositoryWalkResult,
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
    private readonly maxEntries: number | undefined;

    /**
     * @param options.maxDirectories Directories one entry walk lists before it
     * stops; defaults to the shared walk's production limit
     * @param options.maxEntries Directory entries one entry walk examines
     * before it stops; defaults to the shared walk's production limit
     */
    constructor(
        options: {
            readonly maxDirectories?: number;
            readonly maxEntries?: number;
        } = {},
    ) {
        this.maxDirectories =
            options.maxDirectories ?? DEFAULT_MAX_WALK_DIRECTORIES;
        this.maxEntries = options.maxEntries;
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
        const skippedOutsideRoot: string[] = [];
        let directoryLimitReached = false;
        let depthLimitReached = false;
        let entryLimitReached = false;
        let limits: RepositoryWalkResult["limits"] | undefined;

        for (const entry of instructionDiscoveryEntries()) {
            const format = entry.instructionFormat;
            if (format == null) {
                continue;
            }

            if (entry.matchKind === "exact") {
                const exact = await discoverExactFile(root, entry.path, format);
                files.push(...exact.files);
                skippedOutsideRoot.push(...exact.skippedOutsideRoot);
                continue;
            }

            const walked = await walkRepository(targetDir, {
                startRelativePath: entry.path,
                includeFile: (name) => name.endsWith(entry.fileSuffix ?? ".md"),
                includeSubdirectories: entry.includeSubdirectories === true,
                revisit: "once-per-real-directory",
                maxDirectories: this.maxDirectories,
                ...(this.maxEntries === undefined
                    ? {}
                    : { maxEntries: this.maxEntries }),
            });
            limits = walked.limits;
            directoryLimitReached =
                directoryLimitReached || walked.directoryLimitReached;
            depthLimitReached = depthLimitReached || walked.depthLimitReached;
            entryLimitReached = entryLimitReached || walked.entryLimitReached;
            skippedOutsideRoot.push(...walked.skippedOutsideRoot);
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

        const reasons =
            limits === undefined
                ? []
                : describeDiscoveryLimits(
                      {
                          ...(directoryLimitReached
                              ? { maxDirectories: limits.maxDirectories }
                              : {}),
                          ...(depthLimitReached
                              ? { maxDepth: limits.maxDepth }
                              : {}),
                          ...(entryLimitReached
                              ? { maxEntries: limits.maxEntries }
                              : {}),
                      },
                      DISCOVERY_WORDING,
                  );
        if (reasons.length > 0) {
            onDiagnostic?.({
                ruleId: DISCOVERY_LIMIT_RULE_ID,
                message: reasons.join(" "),
            });
        }
        if (skippedOutsideRoot.length > 0) {
            onDiagnostic?.({
                ruleId: SYMLINK_SKIPPED_RULE_ID,
                message: describeSkippedSymlinks(skippedOutsideRoot),
            });
        }

        return files;
    }
}

const DISCOVERY_LIMIT_RULE_ID = "instruction/discovery-limit-reached";
const SYMLINK_SKIPPED_RULE_ID = "instruction/discovery-symlink-skipped";

/** How many skipped links the message names before it counts the rest. */
const LISTED_SKIPPED_LINKS = 5;

function describeSkippedSymlinks(paths: readonly string[]): string {
    const listed = paths.slice(0, LISTED_SKIPPED_LINKS).join(", ");
    const unlisted = paths.length - LISTED_SKIPPED_LINKS;
    const names = unlisted > 0 ? `${listed}, and ${unlisted} more` : listed;
    return `Instruction file discovery skipped ${paths.length} symbolic link(s) that point outside the repository, so their targets were not analyzed: ${names}. Replace a link with a file inside the repository to have it analyzed.`;
}

const DISCOVERY_WORDING: DiscoveryLimitWording = {
    subject: "Instruction file discovery",
    missing: "instruction files",
    consequence: "were not analyzed",
};

interface ExactDiscovery {
    readonly files: DiscoveredInstructionFile[];
    /** The path itself when it is a link to a file outside the repository */
    readonly skippedOutsideRoot: string[];
}

/**
 * Discovers one exact-path instruction file, or nothing when it is missing
 * or resolves outside the root, in which case a link out of the repository is
 * reported as skipped.
 */
async function discoverExactFile(
    root: DiscoveryRoot,
    relativePosixPath: string,
    format: InstructionFileFormat,
): Promise<ExactDiscovery> {
    const inspected = await inspectPathWithinRoot(
        root.rootReal,
        join(root.targetDir, ...relativePosixPath.split("/")),
    );
    if (inspected.status === "ok" && inspected.kind === "file") {
        return {
            files: [
                toDiscoveredFile(root, relativePosixPath, inspected, format),
            ],
            skippedOutsideRoot: [],
        };
    }
    const leadsOutside =
        inspected.status === "outside-root" && inspected.kind === "file";
    return {
        files: [],
        skippedOutsideRoot: leadsOutside ? [relativePosixPath] : [],
    };
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
