/**
 * The shared, bounded walk over a repository tree, used by instruction
 * discovery (lint, MCP) and by doctor so the two cannot disagree about how a
 * tree is traversed.
 *
 * The walk follows symlinks only while their real target stays inside the
 * repository (the shared policy in real-path-within-root), terminates on
 * symlink cycles, lists entries in name order so the result does not depend
 * on the file system, and is bounded in depth and in the number of
 * directories it lists.
 */

import { realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { compareCodeUnits } from "../entities/code-unit-order.js";
import { listDirectoryWithinRoot } from "./file-system-utils.js";
import type { FileIdentity } from "./read-regular-file-no-follow.js";
import {
    inspectPathWithinRoot,
    type OutsideRootKind,
} from "./real-path-within-root.js";

/**
 * The deepest level whose directories are listed (the start directory is 0).
 * A directory at this depth is listed, and its own subdirectories are not
 * entered.
 */
export const DEFAULT_MAX_WALK_DEPTH = 10;
/** Directories listed before the walk stops descending. */
export const DEFAULT_MAX_WALK_DIRECTORIES = 10_000;
/**
 * Directory entries examined before the walk stops. The directory cap counts
 * listings, not the entries in them, and a fan-out of directory aliases lists
 * a wide directory many times over, so this bounds the work itself.
 */
export const DEFAULT_MAX_WALK_ENTRIES = 200_000;
export const DEFAULT_SKIPPED_DIRECTORY_NAMES: readonly string[] = [
    "node_modules",
    ".git",
];

/**
 * What the walk does when a directory is reached by a second path.
 *
 * - `once-per-real-directory`: a real directory is listed once, under the
 *   first path to reach it in name order. Every real file is returned once.
 *   Instruction discovery uses this, so lint reports a file once.
 * - `refuse-ancestors`: a directory is refused only when it is an ancestor of
 *   itself (a symlink cycle). Every other path to a directory is a separate
 *   location the walk lists again, so `.claude/skills -> ../.agents/skills`
 *   stays visible under both names. Doctor uses this because each location
 *   can be loaded by a different harness. Aliases are not a cycle, so only
 *   the directory cap and the entry budget bound a fan-out.
 */
export type DirectoryRevisitPolicy =
    | "once-per-real-directory"
    | "refuse-ancestors";

export interface DirectoryEntryName {
    readonly name: string;
}

/**
 * Lists the entry names of a real directory inside the root. Injectable so
 * the order a file system happens to list entries in can be varied in tests.
 */
export type DirectoryLister = (
    rootReal: string,
    relativeDirectoryPath: string,
) => Promise<readonly DirectoryEntryName[]>;

export interface RepositoryWalkOptions {
    /** Repository-relative POSIX directory to start from; "" is the root */
    readonly startRelativePath: string;
    /** Whether a file with this name is collected */
    readonly includeFile: (fileName: string) => boolean;
    /** Descend into subdirectories at all. Default true */
    readonly includeSubdirectories?: boolean;
    /** Default "once-per-real-directory" */
    readonly revisit?: DirectoryRevisitPolicy;
    /** Descend into a child directory only while depth < maxDepth. Default 10 */
    readonly maxDepth?: number;
    /**
     * Directories listed before the walk stops. Every logical visit counts,
     * except directories skipped by name and revisits the policy refuses.
     * Default 10,000.
     */
    readonly maxDirectories?: number;
    /**
     * Directory entries examined, across every listing, before the walk
     * stops. Default 200,000.
     */
    readonly maxEntries?: number;
    readonly skipDirectoryNames?: readonly string[];
    readonly listDirectory?: DirectoryLister;
}

export interface WalkedFile {
    /** Repository-relative POSIX path where a harness loads the file */
    readonly relativePath: string;
    /** Real, symlink-free absolute path of the file, inside the root */
    readonly real: string;
    /** Identity of the real file when it was walked */
    readonly identity: FileIdentity;
}

export interface RepositoryWalkResult {
    readonly files: readonly WalkedFile[];
    /** True when the directory cap stopped the walk from listing more */
    readonly directoryLimitReached: boolean;
    /**
     * True when a directory was left unentered because it lies below the depth
     * limit, so files in it or under it, if any, are not in the result
     */
    readonly depthLimitReached: boolean;
    /** True when the entry budget stopped the walk from examining more */
    readonly entryLimitReached: boolean;
    /**
     * Repository-relative paths of symbolic links the walk did not follow
     * because their target is outside the repository, limited to those it
     * would otherwise have collected (a file it accepts) or entered (a
     * directory), in the order it met them
     */
    readonly skippedOutsideRoot: readonly string[];
    /** The limits the walk ran with, for messages that name them */
    readonly limits: {
        readonly maxDirectories: number;
        readonly maxDepth: number;
        readonly maxEntries: number;
    };
}

interface WalkSettings {
    readonly startRelativePath: string;
    readonly includeFile: (fileName: string) => boolean;
    readonly includeSubdirectories: boolean;
    readonly revisit: DirectoryRevisitPolicy;
    readonly maxDepth: number;
    readonly maxDirectories: number;
    readonly maxEntries: number;
    readonly skipDirectoryNames: ReadonlySet<string>;
    readonly listDirectory: DirectoryLister;
}

const listWithinRoot: DirectoryLister = async (rootReal, relativePath) => {
    try {
        return await listDirectoryWithinRoot(rootReal, relativePath);
    } catch {
        return [];
    }
};

function resolveSettings(options: RepositoryWalkOptions): WalkSettings {
    return {
        startRelativePath: options.startRelativePath,
        includeFile: options.includeFile,
        includeSubdirectories: options.includeSubdirectories ?? true,
        revisit: options.revisit ?? "once-per-real-directory",
        maxDepth: options.maxDepth ?? DEFAULT_MAX_WALK_DEPTH,
        maxDirectories: options.maxDirectories ?? DEFAULT_MAX_WALK_DIRECTORIES,
        maxEntries: options.maxEntries ?? DEFAULT_MAX_WALK_ENTRIES,
        skipDirectoryNames: new Set(
            options.skipDirectoryNames ?? DEFAULT_SKIPPED_DIRECTORY_NAMES,
        ),
        listDirectory: options.listDirectory ?? listWithinRoot,
    };
}

/**
 * Whether a directory entry name could escape its directory: a name that is
 * the parent or current directory, or that holds a path separator. A name
 * with two dots inside it, such as `review..strict.md`, is an ordinary name.
 */
function isUnsafeEntryName(name: string): boolean {
    return (
        name === "." ||
        name === ".." ||
        name.includes("/") ||
        name.includes("\\")
    );
}

/** Joins a repository-relative directory and an entry without a leading "/". */
function joinRelative(directory: string, name: string): string {
    return directory === "" ? name : `${directory}/${name}`;
}

function segmentsOf(relativePath: string): string[] {
    return relativePath.split("/").filter((segment) => segment !== "");
}

/**
 * Owns the bookkeeping of one walk. State lives on the instance, not in
 * parameters, so a walk cannot leak into another.
 */
class RepositoryWalk {
    private readonly files: WalkedFile[] = [];
    private readonly visitedRealDirectories = new Set<string>();
    private listedDirectories = 0;
    private limitReached = false;
    private depthLimitReached = false;
    private entriesExamined = 0;
    private entryLimitReached = false;
    private readonly skippedOutsideRoot: string[] = [];

    constructor(
        private readonly targetDir: string,
        private readonly rootReal: string,
        private readonly settings: WalkSettings,
    ) {}

    async run(): Promise<RepositoryWalkResult> {
        await this.walkDirectory(this.settings.startRelativePath, 0, []);
        return {
            files: this.files,
            directoryLimitReached: this.limitReached,
            depthLimitReached: this.depthLimitReached,
            entryLimitReached: this.entryLimitReached,
            skippedOutsideRoot: this.skippedOutsideRoot,
            limits: {
                maxDirectories: this.settings.maxDirectories,
                maxDepth: this.settings.maxDepth,
                maxEntries: this.settings.maxEntries,
            },
        };
    }

    private isRevisit(real: string, ancestors: readonly string[]): boolean {
        return this.settings.revisit === "refuse-ancestors"
            ? ancestors.includes(real)
            : this.visitedRealDirectories.has(real);
    }

    private async walkDirectory(
        directoryRelativePath: string,
        depth: number,
        ancestors: readonly string[],
    ): Promise<void> {
        if (this.limitReached) {
            return;
        }
        const directory = await inspectPathWithinRoot(
            this.rootReal,
            join(this.targetDir, ...segmentsOf(directoryRelativePath)),
        );
        if (
            directory.status === "outside-root" &&
            directory.kind === "directory"
        ) {
            this.skippedOutsideRoot.push(directoryRelativePath);
            return;
        }
        if (directory.status !== "ok" || directory.kind !== "directory") {
            return;
        }
        if (this.isRevisit(directory.real, ancestors)) {
            return;
        }
        if (this.listedDirectories >= this.settings.maxDirectories) {
            this.limitReached = true;
            return;
        }
        this.listedDirectories += 1;
        this.visitedRealDirectories.add(directory.real);

        const entries = await this.settings.listDirectory(
            this.rootReal,
            relative(this.rootReal, directory.real),
        );
        const sorted = entries
            .filter((entry) => !isUnsafeEntryName(entry.name))
            .sort((a, b) => compareCodeUnits(a.name, b.name));
        for (const entry of sorted) {
            if (this.entriesExamined >= this.settings.maxEntries) {
                this.entryLimitReached = true;
                return;
            }
            this.entriesExamined += 1;
            await this.walkEntry(
                directory.real,
                joinRelative(directoryRelativePath, entry.name),
                entry.name,
                depth,
                [...ancestors, directory.real],
            );
        }
    }

    private async walkEntry(
        directoryReal: string,
        entryRelativePath: string,
        name: string,
        depth: number,
        ancestors: readonly string[],
    ): Promise<void> {
        const entry = await inspectPathWithinRoot(
            this.rootReal,
            join(directoryReal, name),
        );
        if (entry.status === "outside-root") {
            if (this.wouldHaveCollected(entry.kind, name, depth)) {
                this.skippedOutsideRoot.push(entryRelativePath);
            }
            return;
        }
        if (entry.status !== "ok") {
            return;
        }
        if (entry.kind === "file") {
            this.collectFile(
                entryRelativePath,
                name,
                entry.real,
                entry.identity,
            );
            return;
        }
        if (this.shouldDescend(name, depth)) {
            await this.walkDirectory(entryRelativePath, depth + 1, ancestors);
        } else if (
            this.isTooDeep(name, depth) &&
            !this.isRevisit(entry.real, ancestors)
        ) {
            this.depthLimitReached = true;
        }
    }

    private wouldHaveCollected(
        kind: OutsideRootKind,
        name: string,
        depth: number,
    ): boolean {
        if (kind === "file") {
            return this.settings.includeFile(name);
        }
        return kind === "directory" && this.shouldDescend(name, depth);
    }

    private collectFile(
        relativePath: string,
        name: string,
        real: string,
        identity: FileIdentity,
    ): void {
        if (this.settings.includeFile(name)) {
            this.files.push({ relativePath, real, identity });
        }
    }

    private shouldDescend(name: string, depth: number): boolean {
        return (
            this.settings.includeSubdirectories &&
            depth < this.settings.maxDepth &&
            !this.settings.skipDirectoryNames.has(name)
        );
    }

    private isTooDeep(name: string, depth: number): boolean {
        return (
            this.settings.includeSubdirectories &&
            depth >= this.settings.maxDepth &&
            !this.settings.skipDirectoryNames.has(name)
        );
    }
}

/**
 * Walks a repository from options.startRelativePath and returns the files
 * accepted by options.includeFile, in name order, with the logical path a
 * harness loads each at and the real path to read it from.
 *
 * The cap counts every directory the walk lists (a logical visit), so a
 * directory reached through several aliases is counted each time it is
 * listed. When the cap is hit the walk stops listing, keeps what it found and
 * reports directoryLimitReached; it never throws for it.
 */
export async function walkRepository(
    targetDir: string,
    options: RepositoryWalkOptions,
): Promise<RepositoryWalkResult> {
    const rootReal = await realpath(resolve(targetDir)).catch(() => null);
    const settings = resolveSettings(options);
    if (rootReal === null) {
        return {
            files: [],
            directoryLimitReached: false,
            depthLimitReached: false,
            entryLimitReached: false,
            skippedOutsideRoot: [],
            limits: {
                maxDirectories: settings.maxDirectories,
                maxDepth: settings.maxDepth,
                maxEntries: settings.maxEntries,
            },
        };
    }
    return new RepositoryWalk(targetDir, rootReal, settings).run();
}
