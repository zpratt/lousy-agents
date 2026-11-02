import { listPaths } from "@lousy-agents/core/entities/discovery-limit-message.js";
import type { Finding } from "../entities/finding.js";
import { repositoryNotice } from "./repository-notice.js";

/** The `@` imports a scan checked in a file before it stopped, and the files it stopped in. */
export interface ImportLimitNotice {
    readonly maxImports: number;
    readonly files: readonly string[];
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

/**
 * The advisory that the scan could not read some harness files, so the imports
 * and links they hold are not in the report. Doctor reads every markdown file a
 * harness owns with the strict reader (one hard link, within the size cap).
 * Lint reports a discovered instruction file it cannot open or that is over
 * the cap as `instruction/parse-error`, and refuses a hard-linked file only
 * for a Claude entrypoint, so a hard-linked AGENTS.md or Copilot instruction
 * file is analyzed by lint and reported by doctor. Lint does not check skills
 * or agents for this; doctor does.
 */
export function unreadFileFindings(paths: readonly string[]): Finding[] {
    return paths.length === 0
        ? []
        : [
              repositoryNotice(
                  "instruction-file-unread",
                  `The repository scan could not read ${paths.length} harness file(s) (a file with more than one hard link, a file over 1 MiB, or one the system would not open), so their @ imports and links are not in this report: ${listPaths(paths)}.`,
              ),
          ];
}
