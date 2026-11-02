/**
 * Shared symlink policy for discovering agentic files (instruction files,
 * doctor scan targets): follow a symlink only when its real target stays
 * inside the repository.
 */

import { realpath, stat } from "node:fs/promises";
import { isPathWithinRoot } from "./file-system-utils.js";
import type { FileIdentity } from "./read-regular-file-no-follow.js";

/**
 * The real location of a path whose target stays inside the root.
 */
export interface RealPathWithinRoot {
    readonly kind: "file" | "directory";
    readonly real: string;
}

/**
 * The outcome of following a path to its real location within a root.
 */
export type PathInspection =
    | {
          readonly status: "ok";
          readonly kind: "file" | "directory";
          readonly real: string;
          /** Identity of the real path when it was checked */
          readonly identity: FileIdentity;
      }
    | { readonly status: "missing" }
    | {
          readonly status: "outside-root";
          /**
           * What the target outside the root is, so a caller can say what was
           * skipped. Only its type is read, never its content.
           */
          readonly kind: OutsideRootKind;
      }
    | { readonly status: "unsupported" }
    | {
          /**
           * The path could not be looked at because of a failure of the
           * system or its permissions (too many open files, access denied),
           * so nothing is known about whether it exists.
           */
          readonly status: "unreadable";
      };

export type OutsideRootKind = "file" | "directory" | "other";

/** What inspection needs to know about a path it has resolved. */
export interface InspectionStats extends FileIdentity {
    isDirectory(): boolean;
    isFile(): boolean;
}

/**
 * The file system calls inspection makes. Injectable so each error code the
 * system can fail with can be tested without producing it.
 */
export interface InspectionFsPort {
    realpath(path: string): Promise<string>;
    stat(path: string): Promise<InspectionStats>;
}

const nodeInspectionFs: InspectionFsPort = { realpath, stat };

/**
 * The error codes that mean no file is there. A path the system cannot
 * represent cannot name a file, so it is as missing as one that was never
 * created: a name too long for the file system to hold, one it rejects as
 * invalid, or one holding a NUL byte, which Node rejects before it asks the
 * system at all.
 */
const MISSING_ERROR_CODES: readonly string[] = [
    "ENOENT",
    "ENOTDIR",
    "ENAMETOOLONG",
    "EINVAL",
    "ERR_INVALID_ARG_VALUE",
];

function isMissingError(error: unknown): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        MISSING_ERROR_CODES.includes(error.code)
    );
}

const UNREADABLE_ERROR_CODES: readonly string[] = [
    "EMFILE",
    "ENFILE",
    "EACCES",
    "EPERM",
    "EIO",
];

function isUnreadableError(error: unknown): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        UNREADABLE_ERROR_CODES.includes(error.code)
    );
}

function statusForInspectionError(
    error: unknown,
): "missing" | "unreadable" | "unsupported" {
    if (isMissingError(error)) {
        return "missing";
    }
    return isUnreadableError(error) ? "unreadable" : "unsupported";
}

async function kindOutsideRoot(
    real: string,
    fs: InspectionFsPort,
): Promise<OutsideRootKind> {
    try {
        const outside = await fs.stat(real);
        if (outside.isDirectory()) {
            return "directory";
        }
        return outside.isFile() ? "file" : "other";
    } catch {
        return "other";
    }
}

/**
 * Follows a path (and any symlink along it) to its real location and reports
 * why it cannot be used: missing, outside the real root, neither a regular
 * file nor a directory, or unreadable (the system refused to look at it). Stats the already-resolved real path (rather than
 * re-resolving the symlink) so the within-root check, the type check and the
 * recorded identity observe the same target.
 *
 * @param rootReal Real (symlink-free) path of the root directory
 * @param absolutePath Path to resolve, which may contain symlinks
 * @param fs The file system calls to make; the real ones by default
 */
export async function inspectPathWithinRoot(
    rootReal: string,
    absolutePath: string,
    fs: InspectionFsPort = nodeInspectionFs,
): Promise<PathInspection> {
    try {
        const real = await fs.realpath(absolutePath);
        if (!isPathWithinRoot(rootReal, real)) {
            return {
                status: "outside-root",
                kind: await kindOutsideRoot(real, fs),
            };
        }

        const targetStat = await fs.stat(real);
        const identity = { dev: targetStat.dev, ino: targetStat.ino };
        if (targetStat.isDirectory()) {
            return { status: "ok", kind: "directory", real, identity };
        }
        if (targetStat.isFile()) {
            return { status: "ok", kind: "file", real, identity };
        }
        return { status: "unsupported" };
    } catch (error: unknown) {
        return { status: statusForInspectionError(error) };
    }
}

/**
 * Shared symlink policy for discovering agentic files: a path (or any
 * symlink along it) is followed only when its real target stays inside the
 * real root and is a regular file or directory. Callers must still read the
 * content through the real path with the no-follow readers, which reject a
 * symlink swapped in after this check.
 *
 * @param rootReal Real (symlink-free) path of the root directory
 * @param absolutePath Path to resolve, which may contain symlinks
 * @returns The real path and its kind, or null when the target is missing,
 * outside the root, or not a regular file or directory
 */
export async function resolveRealPathWithinRoot(
    rootReal: string,
    absolutePath: string,
): Promise<RealPathWithinRoot | null> {
    const inspection = await inspectPathWithinRoot(rootReal, absolutePath);
    return inspection.status === "ok"
        ? { kind: inspection.kind, real: inspection.real }
        : null;
}
