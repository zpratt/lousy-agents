/**
 * The job summary section for the diagnostics that describe the whole run.
 *
 * A message can hold a path chosen by whoever authored the pull request, so
 * everything written into the Markdown is escaped to literal text. This module
 * only builds the text; it does no input or output.
 */

import type { LintDiagnostic } from "@lousy-agents/lint";

/** Any line break a Markdown renderer would honor, so a bullet stays one line. */
const LINE_BREAK = /\r\n|\r|\n/g;

/**
 * Characters that can start inline Markdown, HTML or math, and the colon of a
 * URL scheme, which a renderer turns into a link without any syntax. A message
 * can hold a path chosen by whoever authored the pull request, so it is
 * written as literal text.
 */
const MARKDOWN_SPECIALS = /[\\`*_~[\]()<>!#|&@$]|:(?=\/\/)/g;

/**
 * A `www` followed by a dot, which a renderer links as an address. It is
 * escaped wherever it stands and in any case: GitHub links one that follows the
 * start of a line, a space, or one of `_`, `*`, `~` and `(`, and other
 * renderers link `WWW.` too. An escape inside a word such as `awww.` costs
 * nothing.
 */
const WWW_ADDRESS = /www(?=\.)/gi;

export function escapeMarkdown(text: string): string {
    return text
        .replace(MARKDOWN_SPECIALS, (match) => `\\${match}`)
        .replace(WWW_ADDRESS, (match) => `${match}\\`);
}

export function summarySection(diagnostics: readonly LintDiagnostic[]): string {
    const items = diagnostics.map(
        (d) =>
            `- \u26A0\uFE0F \`${d.ruleId ?? "lousy-agents"}\`: ${escapeMarkdown(d.message.replace(LINE_BREAK, " "))}`,
    );
    return `\n### lousy-agents lint: run-level warnings\n\n${items.join("\n")}\n`;
}
