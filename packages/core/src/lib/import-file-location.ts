/**
 * Maps what the file system reported about an import target to the file to
 * read, or to the import failure it means. Pure: no I/O.
 */

import { relative, sep } from "node:path";
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
