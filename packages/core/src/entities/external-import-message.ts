/**
 * The one wording for a Claude `@import` that resolves outside the working
 * directory, shared by lint (instruction/import-escape) and doctor
 * (external-claude-import) so the two cannot drift apart.
 */

/**
 * - `outside-working-directory`: an absolute path outside the repository, or a
 *   relative path that leaves it. Observed: in headless runs it was not loaded
 *   (Claude Code 2.1.316, absolute path outside the working directory).
 * - `home`: a `~/` path. Claude Code's documentation says it is external, but
 *   that case was not run in testing, so the message must not claim it was.
 */
export type ExternalImportKind = "outside-working-directory" | "home";

const MOVE_ADVICE =
    "Move the file into the repo, or import it from ~/.claude/CLAUDE.md instead.";

const OBSERVATION_BY_KIND: Record<ExternalImportKind, string> = {
    "outside-working-directory":
        "In headless, `-p` or CI runs it was not loaded in testing (Claude Code 2.1.316).",
    home: "This `~/` case is docs-based and was not observed in testing.",
};

export function externalImportMessage(
    path: string,
    kind: ExternalImportKind,
): string {
    return `External import: \`${path}\` resolves outside the working directory. Claude Code loads it only after a one-time approval in an interactive session (docs: memory, 'Import additional files'). ${OBSERVATION_BY_KIND[kind]} ${MOVE_ADVICE}`;
}
