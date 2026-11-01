/**
 * The single tokenizer for Claude `@` imports, shared by import expansion and
 * the doctor edge parser, so lint and doctor agree on what an import is.
 *
 * Rules (documented for Claude Code, and for the first four observed on 2.1.316):
 * - A token is `@` at the start of a line followed by a path: a relative or
 *   bare file name (`@./a.md`, `@AGENTS.md`), an absolute path, or `~/`.
 * - A backslash-escaped space stays in the path; the path ends at the first
 *   unescaped space.
 * - A quoted path (`@"..."`, `@'...'`) is not an import.
 * - Inside a code span or a fenced block nothing is an import.
 * - A token whose last segment has no extension and that does not begin with a
 *   path prefix (`@types/node`, `@no-such-thing`) is not clearly a path
 *   (`looksLikePath` is false): if it resolves to a file it is an import, and
 *   if it does not, nothing should be reported.
 */

export interface ImportToken {
    readonly start: number;
    readonly end: number;
    /** The path with escaped spaces unescaped */
    readonly rawTarget: string;
    /** False for a token such as `@types/node` that is not clearly a path */
    readonly looksLikePath: boolean;
}

interface CodeRegion {
    readonly start: number;
    readonly end: number;
}

/**
 * Line-start `@` and a path of non-space characters, where `\ ` (a backslash
 * and a space) belongs to the path. The first character is not a space or `@`.
 */
const HARD_IMPORT_RE = /^@(?![\s@])((?:\\ |\S)+)/gm;

const FENCED_CODE_RE = /^(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^\1[ \t]*$/gm;
const INLINE_CODE_RE = /`+[^`\r\n]*`+/g;

const QUOTE_OPENERS = new Set(['"', "'", "`"]);
const PATH_PREFIXES = ["./", "../", "/", "~/"];
const EXTENSION_RE = /\.[A-Za-z0-9]+$/;

function isInsideCodeRegion(
    index: number,
    regions: readonly CodeRegion[],
): boolean {
    return regions.some(
        (region) => index >= region.start && index < region.end,
    );
}

function collectRegexRanges(
    content: string,
    pattern: RegExp,
    skipInside?: readonly CodeRegion[],
): CodeRegion[] {
    return [...content.matchAll(pattern)]
        .filter(
            (match) =>
                match.index !== undefined &&
                !(skipInside && isInsideCodeRegion(match.index, skipInside)),
        )
        .map((match) => ({
            start: match.index ?? 0,
            end: (match.index ?? 0) + match[0].length,
        }));
}

function findCodeRegions(content: string): CodeRegion[] {
    const fenced = collectRegexRanges(content, FENCED_CODE_RE);
    const inline = collectRegexRanges(content, INLINE_CODE_RE, fenced);
    return [...fenced, ...inline];
}

function looksLikePath(rawTarget: string): boolean {
    const lastSegment = rawTarget.slice(rawTarget.lastIndexOf("/") + 1);
    return (
        PATH_PREFIXES.some((prefix) => rawTarget.startsWith(prefix)) ||
        EXTENSION_RE.test(lastSegment)
    );
}

function isQuoted(rawTarget: string): boolean {
    return QUOTE_OPENERS.has(rawTarget.charAt(0));
}

/**
 * Finds the Claude `@path` import tokens in markdown content, ignoring
 * fenced and inline code, quoted paths, and anything not at the start of a
 * line.
 */
export function findImportTokens(content: string): ImportToken[] {
    const codeRegions = findCodeRegions(content);

    return [...content.matchAll(HARD_IMPORT_RE)]
        .filter(
            (match) =>
                match.index !== undefined &&
                !isInsideCodeRegion(match.index, codeRegions) &&
                !isQuoted(match[1] ?? ""),
        )
        .map((match) => {
            const rawTarget = (match[1] ?? "").replaceAll("\\ ", " ");
            const start = match.index ?? 0;
            return {
                start,
                end: start + match[0].length,
                rawTarget,
                looksLikePath: looksLikePath(rawTarget),
            };
        });
}
