import { realpath } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import {
    discoverAgentFiles,
    discoverInstructionLocations,
    discoverSubagentFiles,
} from "@lousy-agents/core/gateways/agentic-artifact-discovery.js";
import type { NoFollowFsPort } from "@lousy-agents/core/gateways/read-regular-file-no-follow.js";
import {
    DEFAULT_MAX_WALK_DEPTH,
    DEFAULT_MAX_WALK_DIRECTORIES,
    DEFAULT_SKIPPED_DIRECTORY_NAMES,
    type WalkedFile,
    walkRepository,
} from "@lousy-agents/core/gateways/repository-walk.js";
import {
    BUILD_OUTPUT_DIRECTORY_NAMES,
    isFixtureDirectory,
} from "@lousy-agents/core/lib/agentic-discovery-skips.js";
import { DEFAULT_MAX_EDGES } from "@lousy-agents/core/lib/instruction-import-expand.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import { markReferencedRecords } from "../entities/inventory-references.js";
import type { RepositoryScan } from "../use-cases/run-doctor.js";
import type { EdgeResolutionContext } from "./edge-resolution.js";
import {
    buildFileInventory,
    type InventorySourceFile,
    mcpServerRecords,
    type ReadMarkdownContent,
} from "./inventory-records.js";
import { enumerateMcpServers } from "./mcp-config.js";
import { createTargetClassifier } from "./target-classifier.js";

const SCANNABLE_EXTENSIONS = new Set([
    ".md",
    ".mdc",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
]);

// Extensionless files that are known harness convention artifacts
const SCANNABLE_EXTENSIONLESS = new Set([".cursorrules"]);

/** Doctor also skips build output, which the shared walk's default list does not. */
const DOCTOR_SKIPPED_DIRECTORY_NAMES = [
    ...DEFAULT_SKIPPED_DIRECTORY_NAMES,
    ...BUILD_OUTPUT_DIRECTORY_NAMES,
];

function isScannableFile(name: string): boolean {
    if (SCANNABLE_EXTENSIONLESS.has(name)) return true;
    const dot = name.lastIndexOf(".");
    if (dot === -1) return false;
    return SCANNABLE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

export interface ScanOptions {
    /** Directories listed before the scan stops; defaults to the shared walk's limit */
    readonly maxDirectories?: number;
    /** Directory entries examined before the scan stops; defaults to the shared walk's limit */
    readonly maxEntries?: number;
    /** Reads a file's markdown content; defaults to a read of its symlink-free real path, bounded by the shared file size limit */
    readonly readContent?: ReadMarkdownContent;
    /** The file system `@` import targets are opened with; defaults to the real one */
    readonly fs?: NoFollowFsPort;
}

function parentSegmentCount(relativePath: string): number {
    const segments = relativePath
        .split("/")
        .filter((segment) => segment !== "");
    return Math.max(0, segments.length - 1);
}

function toSourceFile(
    repoRoot: string,
    rootReal: string,
    file: WalkedFile,
): InventorySourceFile {
    return {
        absPath: resolve(repoRoot, file.relativePath),
        relPath: file.relativePath,
        readRoot: rootReal,
        readRelPath: relative(rootReal, file.real),
        identity: file.identity,
    };
}

/**
 * Scans a repository into an inventory using the shared walk.
 *
 * Doctor inventories every logical location a harness can load, so a
 * directory reached through an alias (for example
 * `.claude/skills -> ../.agents/skills`) is listed again under each name; only
 * a symlink back to one of its own ancestors is refused. The directory limit,
 * which counts every logical listing, and the entry budget, which counts the
 * entries examined across all of them, are what bound a fan-out of aliases.
 * Each real file is read once however many locations reach it.
 */
export async function scanRepositoryWithReport(
    repoRoot: string,
    options: ScanOptions = {},
): Promise<RepositoryScan> {
    const absRoot = resolve(repoRoot);
    const rootReal = await realpath(absRoot);
    const maxDirectories =
        options.maxDirectories ?? DEFAULT_MAX_WALK_DIRECTORIES;

    const walked = await walkRepository(absRoot, {
        startRelativePath: "",
        includeFile: isScannableFile,
        revisit: "refuse-ancestors",
        skipDirectoryNames: DOCTOR_SKIPPED_DIRECTORY_NAMES,
        skipDirectory: (relativePath) =>
            isFixtureDirectory(relativePath, basename(absRoot)),
        maxDirectories,
        ...(options.maxEntries === undefined
            ? {}
            : { maxEntries: options.maxEntries }),
    });
    const instructionWalks = await discoverInstructionLocations(absRoot, {
        rootDirectoryName: basename(absRoot),
        maxDirectories,
        includeNestedWalk: false,
        ...(options.maxEntries === undefined
            ? {}
            : { maxEntries: options.maxEntries }),
    });
    const knownPaths = new Set(walked.files.map((file) => file.relativePath));
    const catalogLimits = {
        rootDirectoryName: basename(absRoot),
        maxDirectories,
        ...(options.maxEntries === undefined
            ? {}
            : { maxEntries: options.maxEntries }),
    };
    const agentWalk = await discoverAgentFiles(absRoot, catalogLimits);
    const subagentWalk = await discoverSubagentFiles(absRoot, catalogLimits);
    const deepConstructFiles = [...agentWalk.files, ...subagentWalk.files];
    const beyondRootDepth = [
        ...instructionWalks
            .filter((location) => location.role === "catalog")
            .flatMap((location) => location.walked.files),
        ...deepConstructFiles,
    ].filter(
        (file) =>
            !knownPaths.has(file.relativePath) &&
            parentSegmentCount(file.relativePath) > DEFAULT_MAX_WALK_DEPTH,
    );
    // Files the root walk cannot reach are appended after its list, in the
    // catalog walk's order. They are not interleaved into that walk's order.
    const files = [...walked.files, ...beyondRootDepth].map((file) =>
        toSourceFile(absRoot, rootReal, file),
    );
    const catalogWalks = instructionWalks.filter(
        (location) => location.role === "catalog",
    );
    const depthLimitReached =
        walked.depthLimitReached ||
        catalogWalks.some((location) => location.walked.depthLimitReached);
    const constructWalks = [agentWalk, subagentWalk];
    const directoryLimitReached =
        walked.directoryLimitReached ||
        catalogWalks.some(
            (location) => location.walked.directoryLimitReached,
        ) ||
        constructWalks.some((walk) => walk.directoryLimitReached);
    const entryLimitReached =
        walked.entryLimitReached ||
        catalogWalks.some((location) => location.walked.entryLimitReached) ||
        constructWalks.some((walk) => walk.entryLimitReached);
    const skippedOutsideRoot = [...walked.skippedOutsideRoot];
    for (const location of catalogWalks) {
        for (const path of location.walked.skippedOutsideRoot) {
            if (!skippedOutsideRoot.includes(path)) {
                skippedOutsideRoot.push(path);
            }
        }
    }
    for (const walk of constructWalks) {
        for (const path of walk.skippedOutsideRoot) {
            if (!skippedOutsideRoot.includes(path)) {
                skippedOutsideRoot.push(path);
            }
        }
    }

    const edgeContext: EdgeResolutionContext = {
        repoRoot: absRoot,
        rootReal,
        existingAbsPaths: new Set(files.map((file) => file.absPath)),
        classifyTarget: createTargetClassifier(rootReal, { fs: options.fs }),
    };

    const {
        records: fileRecords,
        filesOverImportLimit,
        unreadFiles,
    } = await buildFileInventory(files, edgeContext, options.readContent);
    const mcpServers = await enumerateMcpServers(absRoot);

    return {
        records: [
            ...markReferencedRecords(fileRecords),
            ...mcpServerRecords(mcpServers),
        ],
        ...(directoryLimitReached
            ? {
                  directoryLimit: {
                      maxDirectories: walked.limits.maxDirectories,
                  },
              }
            : {}),
        ...(depthLimitReached
            ? { depthLimit: { maxDepth: walked.limits.maxDepth } }
            : {}),
        ...(entryLimitReached
            ? { entryLimit: { maxEntries: walked.limits.maxEntries } }
            : {}),
        ...(skippedOutsideRoot.length > 0 ? { skippedOutsideRoot } : {}),
        ...(filesOverImportLimit.length > 0
            ? {
                  importLimit: {
                      maxImports: DEFAULT_MAX_EDGES,
                      files: filesOverImportLimit,
                  },
              }
            : {}),
        ...(unreadFiles.length > 0 ? { unreadFiles } : {}),
    };
}

export async function scanRepository(
    repoRoot: string,
    options?: ScanOptions,
): Promise<InventoryRecord[]> {
    return (await scanRepositoryWithReport(repoRoot, options)).records;
}
