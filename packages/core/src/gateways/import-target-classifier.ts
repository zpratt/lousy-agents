/**
 * Classifies an import target for doctor's edge resolution, which needs the
 * verdict without the content. It composes the same primitives as lint's
 * import expansion (`inspectPathWithinRoot`, `toLocatedFile`, the no-follow
 * regular-file checks and `statusForReadFailure`), so the two tools refuse the
 * same targets: a symlink must stay inside the repository, the target must be
 * a regular file with a single hard link, and it must fit the size cap. Lint
 * does not call this function because it reads the file it locates.
 */

import {
    type ImportLocationFailure,
    statusForReadFailure,
    toLocatedFile,
} from "../lib/import-file-location.js";
import {
    checkRegularFileNoFollow,
    type NoFollowFsPort,
} from "./read-regular-file-no-follow.js";
import {
    type InspectionFsPort,
    inspectPathWithinRoot,
} from "./real-path-within-root.js";

export type ImportTargetClassification =
    | {
          readonly ok: true;
          /** Real repository-relative POSIX path of the target */
          readonly real: string;
      }
    | { readonly ok: false; readonly status: ImportLocationFailure };

/**
 * Classifies an import target without reading it.
 *
 * @param rootReal Real (symlink-free) path of the repository root
 * @param absolutePath The target, which may reach its file through symlinks
 * @param maxBytes The size cap for an import target
 * @param options.fs The file system the readability check opens files with
 * @param options.inspectionFs The file system calls the path is inspected with
 */
export async function classifyImportTarget(
    rootReal: string,
    absolutePath: string,
    maxBytes: number,
    options: {
        readonly fs?: NoFollowFsPort;
        readonly inspectionFs?: InspectionFsPort;
    } = {},
): Promise<ImportTargetClassification> {
    const inspection = await inspectPathWithinRoot(
        rootReal,
        absolutePath,
        options.inspectionFs,
    );
    const located = toLocatedFile(rootReal, inspection);
    if (!located.ok) {
        return { ok: false, status: located.status };
    }
    const refusal = await checkRegularFileNoFollow(
        located.realAbsolute,
        maxBytes,
        { expectedIdentity: located.identity, fs: options.fs },
    );
    if (refusal === null) {
        return { ok: true, real: located.real };
    }
    return { ok: false, status: statusForReadFailure(refusal) };
}
