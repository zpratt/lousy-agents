import { realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
    DEFAULT_MAX_WALK_DIRECTORIES,
    DEFAULT_SKIPPED_DIRECTORY_NAMES,
    type WalkedFile,
    walkRepository,
} from "@lousy-agents/core/gateways/repository-walk.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import { markReferencedRecords } from "../entities/inventory-references.js";
import type {
    DiscoveryDepthLimit,
    DiscoveryDirectoryLimit,
    DiscoveryEntryLimit,
} from "../use-cases/discovery-limit-finding.js";
import type { EdgeResolutionContext } from "./edge-resolution.js";
import {
    buildFileInventoryRecords,
    type InventorySourceFile,
    mcpServerRecords,
    type ReadMarkdownContent,
} from "./inventory-records.js";
import { enumerateMcpServers } from "./mcp-config.js";

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

/** Doctor also skips build output, which the shared walk does not. */
const DOCTOR_SKIPPED_DIRECTORY_NAMES = [
    ...DEFAULT_SKIPPED_DIRECTORY_NAMES,
    "dist",
];

function isScannableFile(name: string): boolean {
    if (SCANNABLE_EXTENSIONLESS.has(name)) return true;
    const dot = name.lastIndexOf(".");
    if (dot === -1) return false;
    return SCANNABLE_EXTENSIONS.has(name.slice(dot));
}

export interface ScanOptions {
    /** Directories listed before the scan stops; defaults to the shared walk's limit */
    readonly maxDirectories?: number;
    /** Directory entries examined before the scan stops; defaults to the shared walk's limit */
    readonly maxEntries?: number;
    /** Reads a file's markdown content; defaults to a bounded, no-follow read */
    readonly readContent?: ReadMarkdownContent;
}

export interface ScanReport {
    readonly records: InventoryRecord[];
    /** Present when the scan stopped at its directory limit, so records may be missing */
    readonly directoryLimit?: DiscoveryDirectoryLimit;
    /** Present when the scan left directories below its depth limit unentered, so records may be missing */
    readonly depthLimit?: DiscoveryDepthLimit;
    /** Present when the scan stopped at its entry budget, so records may be missing */
    readonly entryLimit?: DiscoveryEntryLimit;
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
): Promise<ScanReport> {
    const absRoot = resolve(repoRoot);
    const rootReal = await realpath(absRoot);
    const maxDirectories =
        options.maxDirectories ?? DEFAULT_MAX_WALK_DIRECTORIES;

    const walked = await walkRepository(absRoot, {
        startRelativePath: "",
        includeFile: isScannableFile,
        revisit: "refuse-ancestors",
        skipDirectoryNames: DOCTOR_SKIPPED_DIRECTORY_NAMES,
        maxDirectories,
        ...(options.maxEntries === undefined
            ? {}
            : { maxEntries: options.maxEntries }),
    });
    const files = walked.files.map((file) =>
        toSourceFile(absRoot, rootReal, file),
    );

    const edgeContext: EdgeResolutionContext = {
        repoRoot: absRoot,
        rootReal,
        existingAbsPaths: new Set(files.map((file) => file.absPath)),
    };

    const fileRecords = await buildFileInventoryRecords(
        files,
        edgeContext,
        options.readContent,
    );
    const mcpServers = await enumerateMcpServers(absRoot);

    return {
        records: [
            ...markReferencedRecords(fileRecords),
            ...mcpServerRecords(mcpServers),
        ],
        ...(walked.directoryLimitReached
            ? {
                  directoryLimit: {
                      maxDirectories: walked.limits.maxDirectories,
                  },
              }
            : {}),
        ...(walked.depthLimitReached
            ? { depthLimit: { maxDepth: walked.limits.maxDepth } }
            : {}),
        ...(walked.entryLimitReached
            ? { entryLimit: { maxEntries: walked.limits.maxEntries } }
            : {}),
    };
}

export async function scanRepository(
    repoRoot: string,
    options?: ScanOptions,
): Promise<InventoryRecord[]> {
    return (await scanRepositoryWithReport(repoRoot, options)).records;
}
