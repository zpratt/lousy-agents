/**
 * What a coverage result says when instruction file discovery left files out
 * (it hit a limit, or skipped a symbolic link that points outside the
 * repository). A mandatory item reported as undocumented may be documented in
 * a file that was not checked, and a fully documented result covers only the
 * files found. The use case that writes the suggestions and the MCP tool that
 * writes the message use these once, so they cannot say different things.
 */

/** Whether discovery reported anything about itself, which means it left files out. */
export function discoveryLeftFilesOut(
    diagnostics: readonly { readonly ruleId: string }[],
): boolean {
    return diagnostics.length > 0;
}

const ALL_DOCUMENTED_IN_FILES_FOUND =
    "✅ All mandatory feedback loops are documented in the instruction files found, but discovery left some instruction files out, so they were not checked";

const UNDOCUMENTED_IN_FILES_FOUND =
    " in the instruction files found; discovery left some instruction files out, so they may be documented in files that were not checked";

/**
 * The statement that every mandatory item is documented: the caller's own
 * sentence, or the qualified one when discovery left files out.
 */
export function qualifyAllDocumented(
    plain: string,
    leftFilesOut: boolean,
): string {
    return leftFilesOut ? ALL_DOCUMENTED_IN_FILES_FOUND : plain;
}

/**
 * The statement that mandatory items are not documented, with the caveat that
 * they may be documented in a file discovery left out.
 */
export function qualifyUndocumented(
    plain: string,
    leftFilesOut: boolean,
): string {
    return leftFilesOut ? `${plain}${UNDOCUMENTED_IN_FILES_FOUND}` : plain;
}
