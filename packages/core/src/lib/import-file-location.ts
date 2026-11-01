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

/** The import failures a located or read import target can produce. */
export type ImportLocationFailure =
    | "symlink"
    | "unresolved"
    | "not-regular"
    | "hard-linked"
    | "size-exceeded";

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
 * Maps a path inspection to a usable file, or to the import failure it means:
 * a path that only resolves outside the repository is a symlink violation.
 */
export function toLocatedFile(
    rootReal: string,
    inspection: PathInspection,
): LocatedFile | { ok: false; status: ImportLocationFailure } {
    if (inspection.status === "outside-root") {
        return { ok: false, status: "symlink" };
    }
    if (inspection.status !== "ok") {
        return { ok: false, status: "unresolved" };
    }
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
        case "identity-mismatch":
        case "unreadable":
            return "unresolved";
    }
}
