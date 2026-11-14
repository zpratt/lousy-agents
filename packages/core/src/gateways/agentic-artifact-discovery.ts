/**
 * Instruction discovery shared by lint and doctor.
 *
 * Each directory-prefix instruction location is walked from that location, so
 * depth 10 is counted from the catalog root. The walk keeps every logical
 * path (`refuse-ancestors`). Lint collapses those paths to one per real file.
 */

import type { AgenticLocationEntry } from "../entities/agentic-location-catalog.js";
import { isNestedInstructionFilename } from "../entities/agentic-location-catalog.js";
import { compareCodeUnits } from "../entities/code-unit-order.js";
import type { InstructionFileFormat } from "../entities/instruction-quality.js";
import {
    BUILD_OUTPUT_DIRECTORY_NAMES,
    isFixtureDirectory,
} from "../lib/agentic-discovery-skips.js";
import { instructionDiscoveryEntries } from "../lib/agentic-location-matchers.js";
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
    },
): RepositoryWalkOptions {
    return {
        startRelativePath: entry.path,
        includeFile: (name) => name.endsWith(entry.fileSuffix ?? ".md"),
        includeSubdirectories: entry.includeSubdirectories === true,
        revisit: "refuse-ancestors",
        maxDepth: DEFAULT_MAX_WALK_DEPTH,
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
