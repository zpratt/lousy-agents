import { listPaths } from "@lousy-agents/core/entities/discovery-limit-message.js";
import type { Finding } from "../entities/finding.js";

/** The `@` imports a scan checked in a file before it stopped, and the files it stopped in. */
export interface ImportLimitNotice {
    readonly maxImports: number;
    readonly files: readonly string[];
}

function repositoryNotice(criterionId: string, description: string): Finding {
    return {
        id: `${criterionId}:all:repository`,
        criterionId,
        targetId: "all:repository",
        severity: "medium",
        category: "governance",
        classification: "advisory",
        intentGated: false,
        assumedIntent: false,
        description,
    };
}

/**
 * The advisory that the scan skipped symbolic links that lead outside the
 * repository, so what they point at is not in the report. Like the discovery
 * limit it is always visible and never fails `--ci`.
 */
export function skippedSymlinkFindings(paths: readonly string[]): Finding[] {
    return paths.length === 0
        ? []
        : [
              repositoryNotice(
                  "discovery-symlink-skipped",
                  `The repository scan skipped ${paths.length} symbolic link(s) that point outside the repository, so their targets are not in this report: ${listPaths(paths)}. Replace a link with a file inside the repository to have it scanned.`,
              ),
          ];
}

/**
 * The advisory that the scan checked only the first imports of some files, so
 * the imports after them are not in the report.
 */
export function importLimitFindings(
    notice: ImportLimitNotice | undefined,
): Finding[] {
    return notice === undefined
        ? []
        : [
              repositoryNotice(
                  "import-limit-reached",
                  `The repository scan checked only the first ${notice.maxImports} @ imports of ${notice.files.length} file(s), so imports after them are not in this report: ${listPaths(notice.files)}.`,
              ),
          ];
}
