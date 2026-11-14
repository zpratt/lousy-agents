/**
 * Gateway for discovering instruction files across multiple formats.
 * Supports GitHub Copilot, Claude Code, and community agent instruction formats.
 */

import { realpath } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { isNestedInstructionFilename } from "../entities/agentic-location-catalog.js";
import {
    type DiscoveryLimitWording,
    describeDiscoveryLimits,
    describeSkippedSymlinks,
} from "../entities/discovery-limit-message.js";
import type {
    DiscoveredInstructionFile,
    InstructionDiscoveryDiagnosticSink,
    InstructionFileFormat,
} from "../entities/instruction-quality.js";
import {
    DISCOVERY_LIMIT_REACHED_RULE_ID,
    DISCOVERY_SYMLINK_SKIPPED_RULE_ID,
} from "../entities/lint-rules.js";
import {
    formatForAdditionalInstructionFile,
    instructionDiscoveryEntries,
} from "../lib/agentic-location-matchers.js";
import type { InstructionFileDiscoveryGateway } from "../use-cases/analyze-instruction-quality.js";
import {
    collapseToFirstRealFile,
    discoverInstructionLocations,
} from "./agentic-artifact-discovery.js";
import {
    inspectPathWithinRoot,
    type RealPathWithinRoot,
} from "./real-path-within-root.js";
import {
    DEFAULT_MAX_WALK_DIRECTORIES,
    type RepositoryWalkResult,
    type WalkedFile,
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
        const findings = new DiscoveryFindings();

        const rootDirectoryName = basename(resolve(targetDir));
        const locations = await discoverInstructionLocations(targetDir, {
            rootDirectoryName,
            maxDirectories: this.maxDirectories,
            ...(this.maxEntries === undefined
                ? {}
                : { maxEntries: this.maxEntries }),
        });
        const catalogWalks = locations.filter(
            (location) => location.role === "catalog",
        );
        let catalogIndex = 0;
        const seen = new Set<string>();
        for (const entry of instructionDiscoveryEntries()) {
            const format = entry.instructionFormat;
            if (format == null) {
                continue;
            }
            if (entry.matchKind === "exact") {
                const exact = await discoverExactFile(root, entry.path, format);
                findings.addExact(exact);
                if (exact.files.length > 0) {
                    seen.add(entry.path);
                }
                continue;
            }
            const walked = catalogWalks[catalogIndex]?.walked;
            catalogIndex += 1;
            if (walked === undefined) {
                continue;
            }
            const files = collapseToFirstRealFile(walked.files);
            findings.addWalk({ ...walked, files }, (file) =>
                toDiscoveredFile(
                    root,
                    file.relativePath,
                    { kind: "file", real: file.real },
                    format,
                ),
            );
            for (const file of files) {
                seen.add(file.relativePath);
            }
        }

        const nested = locations.find((location) => location.role === "nested");
        if (nested !== undefined) {
            this.recordNestedInstructionFiles(
                root,
                seen,
                findings,
                nested.walked,
            );
        }

        findings.report(onDiagnostic);
        return findings.files;
    }

    private recordNestedInstructionFiles(
        root: DiscoveryRoot,
        seen: ReadonlySet<string>,
        findings: DiscoveryFindings,
        additional: RepositoryWalkResult,
    ): void {
        const candidates = additional.files.filter((file) => {
            if (seen.has(file.relativePath)) {
                return false;
            }
            return (
                formatForAdditionalInstructionFile(file.relativePath) !== null
            );
        });
        const files = collapseToFirstRealFile(candidates);
        findings.addWalk(
            {
                ...additional,
                files,
                skippedOutsideRoot: additional.skippedOutsideRoot.filter(
                    isNestedInstructionLinkPath,
                ),
                depthLimitReached: false,
            },
            (file) =>
                toDiscoveredFile(
                    root,
                    file.relativePath,
                    { kind: "file", real: file.real },
                    formatForAdditionalInstructionFile(file.relativePath) ??
                        "agents-md",
                ),
        );
        if (
            additional.depthLimitedDirectories.some(
                (path) => !isUnderInstructionCatalogDirectory(path),
            )
        ) {
            findings.noteNestedFilenameDepth(additional.limits.maxDepth);
        }
    }
}

/**
 * What discovery found across the instruction locations it looked at, and
 * what it left out, so it can say so once at the end.
 */
class DiscoveryFindings {
    readonly files: DiscoveredInstructionFile[] = [];
    private readonly skippedOutsideRoot: string[] = [];
    private directoryLimitReached = false;
    private depthLimitReached = false;
    private nestedFilenameDepth: number | undefined;
    private entryLimitReached = false;
    private limits: RepositoryWalkResult["limits"] | undefined;

    addExact(exact: ExactDiscovery): void {
        this.files.push(...exact.files);
        this.skippedOutsideRoot.push(...exact.skippedOutsideRoot);
    }

    addWalk(
        walked: RepositoryWalkResult,
        toDiscovered: (file: WalkedFile) => DiscoveredInstructionFile,
    ): void {
        this.recordLimits(walked);
        for (const path of walked.skippedOutsideRoot) {
            if (!this.skippedOutsideRoot.includes(path)) {
                this.skippedOutsideRoot.push(path);
            }
        }
        this.files.push(...walked.files.map(toDiscovered));
    }

    noteNestedFilenameDepth(maxDepth: number): void {
        this.nestedFilenameDepth = maxDepth;
    }

    report(onDiagnostic?: InstructionDiscoveryDiagnosticSink): void {
        const reasons = this.describeLimits();
        if (reasons.length > 0) {
            onDiagnostic?.({
                ruleId: DISCOVERY_LIMIT_REACHED_RULE_ID,
                message: reasons.join(" "),
            });
        }
        if (this.skippedOutsideRoot.length > 0) {
            onDiagnostic?.({
                ruleId: DISCOVERY_SYMLINK_SKIPPED_RULE_ID,
                message: describeSkippedSymlinks(this.skippedOutsideRoot),
            });
        }
    }

    private recordLimits(walked: RepositoryWalkResult): void {
        if (this.limits === undefined) {
            this.limits = { ...walked.limits };
        }
        if (walked.directoryLimitReached) {
            this.directoryLimitReached = true;
            this.limits = {
                ...this.limits,
                maxDirectories: walked.limits.maxDirectories,
            };
        }
        if (walked.depthLimitReached) {
            this.depthLimitReached = true;
            this.limits = {
                ...this.limits,
                maxDepth: walked.limits.maxDepth,
            };
        }
        if (walked.entryLimitReached) {
            this.entryLimitReached = true;
            this.limits = {
                ...this.limits,
                maxEntries: walked.limits.maxEntries,
            };
        }
    }

    private describeLimits(): string[] {
        if (this.limits === undefined) {
            return [];
        }
        const sentences = describeDiscoveryLimits(
            {
                ...(this.directoryLimitReached
                    ? { maxDirectories: this.limits.maxDirectories }
                    : {}),
                ...(this.depthLimitReached
                    ? { maxDepth: this.limits.maxDepth }
                    : {}),
                ...(this.entryLimitReached
                    ? { maxEntries: this.limits.maxEntries }
                    : {}),
            },
            DISCOVERY_WORDING,
        );
        if (this.nestedFilenameDepth !== undefined) {
            sentences.push(
                ...describeDiscoveryLimits(
                    { maxDepth: this.nestedFilenameDepth },
                    NESTED_FILENAME_DEPTH_WORDING,
                ),
            );
        }
        return sentences;
    }
}

const DISCOVERY_WORDING: DiscoveryLimitWording = {
    subject: "Instruction file discovery",
    missing: "instruction files",
    consequence: "were not analyzed",
};

const NESTED_FILENAME_DEPTH_WORDING: DiscoveryLimitWording = {
    subject: "Instruction file discovery",
    missing: "CLAUDE.md, AGENTS.md, AGENTS.MD, and agents.md files",
    consequence: "may not have been analyzed",
};

function isNestedInstructionLinkPath(relativePath: string): boolean {
    const slash = relativePath.lastIndexOf("/");
    const name = slash === -1 ? relativePath : relativePath.slice(slash + 1);
    return isNestedInstructionFilename(name);
}

function isUnderInstructionCatalogDirectory(relativePath: string): boolean {
    return instructionDiscoveryEntries().some(
        (entry) =>
            entry.matchKind === "directory-prefix" &&
            (relativePath === entry.path ||
                relativePath.startsWith(`${entry.path}/`)),
    );
}

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
