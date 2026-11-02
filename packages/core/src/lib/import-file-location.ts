/**
 * Maps what the file system reported about an import target to the file to
 * read, or to the import failure it means. Pure: no I/O.
 */

import { isAbsolute, relative, sep } from "node:path";
import type {
    BoundedReadFailure,
    FileIdentity,
} from "../gateways/read-regular-file-no-follow.js";
import type { PathInspection } from "../gateways/real-path-within-root.js";

/**
 * The import failures a located or read import target can produce. An
 * "unreadable" target is one the system would not let the process look at or
 * open (too many open files, access denied): it is not known to be missing, so
 * no caller may report it as missing.
 */
export type ImportLocationFailure =
    | "symlink"
    | "unresolved"
    | "not-regular"
    | "hard-linked"
    | "size-exceeded"
    | "unreadable";

export interface LocatedFile {
    readonly ok: true;
    /** Real repository-relative POSIX path */
    readonly real: string;
    readonly realAbsolute: string;
    readonly identity: FileIdentity;
}

function toPosix(pathValue: string): string {
    return pathValue.split(sep).join("/");
}

/**
 * The repository-relative path of an absolute target that lies strictly
 * inside one of the roots, or the "absolute" failure when it does not.
 */
export function relativeToAnyRoot(
    absoluteTarget: string,
    repoRoots: readonly string[],
): { ok: true; relativePath: string } | { ok: false; status: "absolute" } {
    for (const root of repoRoots) {
        const inside = relative(root, absoluteTarget);
        const isInside =
            inside !== "" && inside !== ".." && !inside.startsWith(`..${sep}`);
        if (isInside && !isAbsolute(inside)) {
            return { ok: true, relativePath: toPosix(inside) };
        }
    }
    return { ok: false, status: "absolute" };
}

/**
 * Maps a path inspection to a usable file, or to the import failure it means.
 * Only a path that is not there is "unresolved". A path that only resolves
 * outside the repository is a symlink violation, one the system would not let
 * the process look at is "unreadable", and one that is there but cannot be
 * used as a file (a directory, a named pipe, a symbolic link that loops) is
 * "not-regular".
 */
export function toLocatedFile(
    rootReal: string,
    inspection: PathInspection,
): LocatedFile | { ok: false; status: ImportLocationFailure } {
    switch (inspection.status) {
        case "outside-root":
            return { ok: false, status: "symlink" };
        case "unreadable":
            return { ok: false, status: "unreadable" };
        case "unsupported":
            return { ok: false, status: "not-regular" };
        case "missing":
            return { ok: false, status: "unresolved" };
        case "ok":
            return locateInspectedFile(rootReal, inspection);
    }
}

function locateInspectedFile(
    rootReal: string,
    inspection: Extract<PathInspection, { status: "ok" }>,
): LocatedFile | { ok: false; status: ImportLocationFailure } {
    if (inspection.kind !== "file") {
        return { ok: false, status: "not-regular" };
    }
    return {
        ok: true,
        real: toPosix(relative(rootReal, inspection.real)),
        realAbsolute: inspection.real,
        identity: inspection.identity,
    };
}

export function statusForReadFailure(
    reason: BoundedReadFailure,
): ImportLocationFailure {
    switch (reason) {
        case "symlink":
            return "symlink";
        case "too-large":
            return "size-exceeded";
        case "not-regular":
            return "not-regular";
        case "hard-linked":
            return "hard-linked";
        case "unreadable":
        case "identity-mismatch":
            return "unreadable";
    }
}
