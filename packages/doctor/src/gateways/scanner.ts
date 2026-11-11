import { realpath } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import type { NoFollowFsPort } from "@lousy-agents/core/gateways/read-regular-file-no-follow.js";
import {
    DEFAULT_MAX_WALK_DIRECTORIES,
    DEFAULT_SKIPPED_DIRECTORY_NAMES,
    type WalkedFile,
    walkRepository,
} from "@lousy-agents/core/gateways/repository-walk.js";
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

/** Doctor also skips build output, which the shared walk does not. */
const DOCTOR_SKIPPED_DIRECTORY_NAMES = [
    ...DEFAULT_SKIPPED_DIRECTORY_NAMES,
    "dist",
];

/**
 * True when `relativePath` is a fixture directory the walk met below the
 * scan root. The root itself is not passed here. When the relative path has
 * no parent segment, `rootDirectoryName` is that parent, so a scan started
 * in a directory named `tests` still skips its `fixtures` child.
 *
 * `tests/fixtures` is the parent and child, not every directory named
 * `fixtures`, so `src/fixtures` stays in the scan. `__fixtures__` and
 * `testdata` are names at any depth.
 */
function isFixtureDirectory(
    relativePath: string,
    rootDirectoryName: string,
): boolean {
    const segments = relativePath.split("/");
    const name = segments[segments.length - 1];
    if (name === "__fixtures__" || name === "testdata") {
        return true;
    }
    const parent =
        segments.length >= 2
            ? segments[segments.length - 2]
            : rootDirectoryName;
    return parent === "tests" && name === "fixtures";
}

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
    const files = walked.files.map((file) =>
        toSourceFile(absRoot, rootReal, file),
    );

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
        ...(walked.skippedOutsideRoot.length > 0
            ? { skippedOutsideRoot: walked.skippedOutsideRoot }
            : {}),
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
