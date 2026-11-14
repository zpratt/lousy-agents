/**
 * Instruction discovery shared by lint and doctor.
 *
 * Each directory-prefix instruction location is walked from that location, so
 * depth 10 is counted from the catalog root. The walk keeps every logical
 * path (`refuse-ancestors`). Lint collapses those paths to one per real file.
 */

import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { AgenticLocationEntry } from "../entities/agentic-location-catalog.js";
import { isNestedInstructionFilename } from "../entities/agentic-location-catalog.js";
import { compareCodeUnits } from "../entities/code-unit-order.js";
import type { InstructionFileFormat } from "../entities/instruction-quality.js";
import {
    BUILD_OUTPUT_DIRECTORY_NAMES,
    isFixtureDirectory,
} from "../lib/agentic-discovery-skips.js";
import {
    agentDirectoryRoots,
    instructionDiscoveryEntries,
    skillDirectoryRoots,
    subagentDirectoryRoots,
} from "../lib/agentic-location-matchers.js";
import type { FileIdentity } from "./read-regular-file-no-follow.js";
import {
    DEFAULT_MAX_WALK_DEPTH,
    DEFAULT_MAX_WALK_DIRECTORIES,
    DEFAULT_SKIPPED_DIRECTORY_NAMES,
    type RepositoryWalkOptions,
    type RepositoryWalkResult,
    type WalkedFile,
    walkRepository,
} from "./repository-walk.js";

/** Directories below an agent or subagent catalog root that are still listed. */
export const AGENT_CATALOG_DEPTH = 32;

/** One skill directory below a skill root. `root/<name>/SKILL.md` is depth 1. */
export const SKILL_CATALOG_DEPTH = 1;

export interface InstructionLocationWalk {
    readonly role: "catalog" | "nested";
    readonly format: InstructionFileFormat | null;
    readonly walked: RepositoryWalkResult;
}

export async function discoverInstructionLocations(
    targetDir: string,
    options: {
        readonly rootDirectoryName: string;
        readonly maxDirectories?: number;
        readonly maxEntries?: number;
        /** When false, the repository-root filename walk is not run. */
        readonly includeNestedWalk?: boolean;
    },
): Promise<InstructionLocationWalk[]> {
    const walks: InstructionLocationWalk[] = [];
    for (const entry of instructionDiscoveryEntries()) {
        if (
            entry.instructionFormat == null ||
            entry.matchKind !== "directory-prefix"
        ) {
            continue;
        }
        walks.push({
            role: "catalog",
            format: entry.instructionFormat,
            walked: await walkRepository(
                targetDir,
                instructionWalkOptions(entry, options),
            ),
        });
    }
    if (options.includeNestedWalk !== false) {
        walks.push({
            role: "nested",
            format: null,
            walked: await walkRepository(targetDir, {
                ...instructionWalkOptions(
                    {
                        path: "",
                        matchKind: "directory-prefix",
                        includeSubdirectories: true,
                        fileSuffix: undefined,
                    },
                    options,
                ),
                startRelativePath: "",
                includeFile: (name) => isNestedInstructionFilename(name),
                includeSubdirectories: true,
            }),
        });
    }
    return walks;
}

/**
 * One logical path per real file. The path kept is the full relative path
 * that sorts first by UTF-16 code unit. That is not the directory a
 * name-ordered walk meets first: `b-extra/file` sorts before `b/file`
 * because `-` comes before `/`.
 */
export function collapseToFirstRealFile(
    files: readonly WalkedFile[],
): WalkedFile[] {
    const sorted = [...files].sort((left, right) =>
        compareCodeUnits(left.relativePath, right.relativePath),
    );
    const seen = new Set<string>();
    const kept: WalkedFile[] = [];
    for (const file of sorted) {
        const key = identityKey(file.identity);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        kept.push(file);
    }
    return kept;
}

/**
 * Markdown files under the agent catalog roots, to {@link AGENT_CATALOG_DEPTH}
 * from each root. Symlinks are followed when they stay inside the repository;
 * lint drops those paths afterwards.
 */
export async function discoverAgentFiles(
    targetDir: string,
    options: CatalogWalkLimits,
): Promise<WalkedFile[]> {
    return discoverMarkdownUnderRoots(
        targetDir,
        agentDirectoryRoots(),
        AGENT_CATALOG_DEPTH,
        options,
    );
}

/** Markdown files under the subagent catalog roots, to the agent depth. */
export async function discoverSubagentFiles(
    targetDir: string,
    options: CatalogWalkLimits,
): Promise<WalkedFile[]> {
    return discoverMarkdownUnderRoots(
        targetDir,
        subagentDirectoryRoots(),
        AGENT_CATALOG_DEPTH,
        options,
    );
}

/**
 * `SKILL.md` files one directory below a skill root. A `SKILL.md` in the root
 * itself, or nested further, is not a skill file.
 */
export async function discoverSkillFiles(
    targetDir: string,
    options: CatalogWalkLimits,
): Promise<WalkedFile[]> {
    const files = await discoverMarkdownUnderRoots(
        targetDir,
        skillDirectoryRoots(),
        SKILL_CATALOG_DEPTH,
        options,
        (name) => name === "SKILL.md",
    );
    return files.filter((file) =>
        skillDirectoryRoots().some((root) =>
            isSkillFileUnderRoot(root, file.relativePath),
        ),
    );
}

function isSkillFileUnderRoot(root: string, relativePath: string): boolean {
    const rootSegments = root.split("/").filter((segment) => segment !== "");
    const segments = relativePath
        .split("/")
        .filter((segment) => segment !== "");
    return (
        segments.length === rootSegments.length + 2 &&
        segments.at(-1) === "SKILL.md" &&
        rootSegments.every((segment, index) => segments[index] === segment)
    );
}

/**
 * Drops a path that is a symbolic link or sits under one. Skills, agents,
 * subagents, and hooks keep this filter; the shared walk itself follows
 * in-repo links so doctor can inventory them.
 */
export async function omitSymlinkedPaths(
    targetDir: string,
    files: readonly WalkedFile[],
): Promise<WalkedFile[]> {
    const kept: WalkedFile[] = [];
    for (const file of files) {
        if (!(await containsSymbolicLink(targetDir, file.relativePath))) {
            kept.push(file);
        }
    }
    return kept;
}

/**
 * Catalog paths that exist as regular files and are not symbolic links.
 * Hooks and MCP configs use this, then apply their own content checks.
 */
export async function discoverExactRegularFiles(
    targetDir: string,
    relativePaths: readonly string[],
): Promise<string[]> {
    const found: string[] = [];
    for (const relativePath of relativePaths) {
        if (relativePath.split("/").some((segment) => segment === "..")) {
            continue;
        }
        try {
            const stat = await lstat(
                join(targetDir, ...relativePath.split("/")),
            );
            if (stat.isFile()) {
                found.push(relativePath);
            }
        } catch {
            // Missing paths are not catalog hits.
        }
    }
    return found;
}

interface CatalogWalkLimits {
    readonly rootDirectoryName: string;
    readonly maxDirectories?: number;
    readonly maxEntries?: number;
}

async function discoverMarkdownUnderRoots(
    targetDir: string,
    roots: readonly string[],
    maxDepth: number,
    options: CatalogWalkLimits,
    includeFile: (name: string) => boolean = (name) => name.endsWith(".md"),
): Promise<WalkedFile[]> {
    const files: WalkedFile[] = [];
    for (const root of roots) {
        const walked = await walkRepository(targetDir, {
            ...instructionWalkOptions(
                {
                    path: root,
                    matchKind: "directory-prefix",
                    includeSubdirectories: true,
                    fileSuffix: undefined,
                },
                { ...options, maxDepth },
            ),
            includeFile,
            includeSubdirectories: true,
            maxDepth,
        });
        files.push(...walked.files);
    }
    return files;
}

async function containsSymbolicLink(
    targetDir: string,
    relativePath: string,
): Promise<boolean> {
    const segments = relativePath
        .split("/")
        .filter((segment) => segment !== "");
    const walked: string[] = [];
    for (const segment of segments) {
        walked.push(segment);
        try {
            const stat = await lstat(join(targetDir, ...walked));
            if (stat.isSymbolicLink()) {
                return true;
            }
        } catch {
            return false;
        }
    }
    return false;
}

function identityKey(identity: FileIdentity): string {
    return `${identity.dev}:${identity.ino}`;
}

function instructionWalkOptions(
    entry: Pick<
        AgenticLocationEntry,
        "path" | "matchKind" | "includeSubdirectories" | "fileSuffix"
    >,
    options: {
        readonly rootDirectoryName: string;
        readonly maxDirectories?: number;
        readonly maxEntries?: number;
        readonly maxDepth?: number;
    },
): RepositoryWalkOptions {
    return {
        startRelativePath: entry.path,
        includeFile: (name) => name.endsWith(entry.fileSuffix ?? ".md"),
        includeSubdirectories: entry.includeSubdirectories === true,
        revisit: "refuse-ancestors",
        maxDepth: options.maxDepth ?? DEFAULT_MAX_WALK_DEPTH,
        maxDirectories: options.maxDirectories ?? DEFAULT_MAX_WALK_DIRECTORIES,
        skipDirectoryNames: [
            ...DEFAULT_SKIPPED_DIRECTORY_NAMES,
            ...BUILD_OUTPUT_DIRECTORY_NAMES,
        ],
        skipDirectory: (relativePath) =>
            isFixtureDirectory(relativePath, options.rootDirectoryName),
        ...(options.maxEntries === undefined
            ? {}
            : { maxEntries: options.maxEntries }),
    };
}
