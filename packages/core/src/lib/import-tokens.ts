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

/**
 * Receives the number of steps a scan has just taken: lines looked at,
 * characters walked, lookups made. It exists so a test can pin the cost of a
 * scan exactly, without timing it.
 */
export type CountSteps = (steps: number) => void;

const ignoreSteps: CountSteps = () => undefined;

export interface ImportToken {
    readonly start: number;
    readonly end: number;
    /** The path with escaped spaces unescaped */
    readonly rawTarget: string;
    /** False for a token such as `@types/node` that is not clearly a path */
    readonly looksLikePath: boolean;
}

/**
 * Code regions as two parallel arrays, ordered by start, so a file with a
 * hundred thousand of them is two arrays of numbers and not a hundred
 * thousand objects.
 */
interface RegionList {
    readonly starts: number[];
    readonly ends: number[];
}

/**
 * The lines that begin with a run of three or more fence characters: where
 * each begins and how long its run is, in file order.
 */
interface FenceLines {
    readonly starts: number[];
    readonly lengths: number[];
}

interface ClosingLines {
    readonly starts: number[];
    readonly ends: number[];
    cursor: number;
}

/**
 * Line-start `@` and a path of non-space characters, where `\ ` (a backslash
 * and a space) belongs to the path. The first character is not a space or `@`.
 */
const HARD_IMPORT_RE = /^@(?![\s@])((?:\\ |\S)+)/gm;

const INLINE_CODE_RE = /`+[^`\r\n]*`+/g;

const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;
const SPACE = 0x20;
const TAB = 0x09;
const BACKTICK = 0x60;
const TILDE = 0x7e;
const MIN_FENCE_LENGTH = 3;

const QUOTE_OPENERS = new Set(['"', "'", "`"]);
const PATH_PREFIXES = ["./", "../", "/", "~/"];
const EXTENSION_RE = /\.[A-Za-z0-9]+$/;

function isLineTerminator(code: number): boolean {
    return (
        code === LINE_FEED ||
        code === CARRIAGE_RETURN ||
        code === LINE_SEPARATOR ||
        code === PARAGRAPH_SEPARATOR
    );
}

function isLineStart(content: string, index: number): boolean {
    return index === 0 || isLineTerminator(content.charCodeAt(index - 1));
}

function fenceRunLength(content: string, start: number): number {
    const code = content.charCodeAt(start);
    if (code !== BACKTICK && code !== TILDE) {
        return 0;
    }
    let end = start + 1;
    while (content.charCodeAt(end) === code) {
        end += 1;
    }
    return end - start;
}

function skipSpacesAndTabs(content: string, from: number): number {
    let index = from;
    while (
        content.charCodeAt(index) === SPACE ||
        content.charCodeAt(index) === TAB
    ) {
        index += 1;
    }
    return index;
}

function closingKey(code: number, length: number): number {
    return length * 2 + (code === TILDE ? 1 : 0);
}

function addClosingLine(
    closers: Map<number, ClosingLines>,
    key: number,
    start: number,
    end: number,
): void {
    const existing = closers.get(key);
    if (existing) {
        existing.starts.push(start);
        existing.ends.push(end);
        return;
    }
    closers.set(key, { starts: [start], ends: [end], cursor: 0 });
}

/**
 * One pass over the lines that begin with three or more fence characters.
 * A line that is only the fence run and trailing spaces or tabs can close a
 * fence of exactly that length, so those lines are indexed by character and
 * length, in file order.
 */
function collectFenceLines(
    content: string,
    countSteps: CountSteps,
): {
    fenceLines: FenceLines;
    closers: Map<number, ClosingLines>;
} {
    const fenceLines: FenceLines = { starts: [], lengths: [] };
    const closers = new Map<number, ClosingLines>();
    for (let index = 0; index < content.length; index += 1) {
        if (!isLineStart(content, index)) {
            continue;
        }
        const length = fenceRunLength(content, index);
        countSteps(length + 1);
        if (length < MIN_FENCE_LENGTH) {
            continue;
        }
        fenceLines.starts.push(index);
        fenceLines.lengths.push(length);
        const trailingEnd = skipSpacesAndTabs(content, index + length);
        countSteps(trailingEnd - index - length);
        if (
            trailingEnd >= content.length ||
            isLineTerminator(content.charCodeAt(trailingEnd))
        ) {
            addClosingLine(
                closers,
                closingKey(content.charCodeAt(index), length),
                index,
                trailingEnd,
            );
        }
    }
    return { fenceLines, closers };
}

/**
 * Finds the first carriage return or line feed at or after `from`. Calls
 * arrive in increasing order, so the last answer is reused while it still
 * applies and the whole scan reads each character once.
 */
function createLineBreakFinder(
    content: string,
    countSteps: CountSteps,
): (from: number) => number {
    let answeredFrom = -1;
    let answer = -1;
    return (from) => {
        if (answeredFrom <= from && answer >= from) {
            countSteps(1);
            return answer;
        }
        let index = from;
        while (
            index < content.length &&
            content.charCodeAt(index) !== LINE_FEED &&
            content.charCodeAt(index) !== CARRIAGE_RETURN
        ) {
            index += 1;
        }
        countSteps(index - from + 1);
        answeredFrom = from;
        answer = index;
        return index;
    };
}

/**
 * Where the body of a fence begins: the opening line must end in a line feed
 * or a carriage return and a line feed.
 */
function fenceBodyStart(
    content: string,
    infoStart: number,
    findLineBreak: (from: number) => number,
): number | undefined {
    const lineBreak = findLineBreak(infoStart);
    const code = content.charCodeAt(lineBreak);
    if (code === LINE_FEED) {
        return lineBreak + 1;
    }
    if (
        code === CARRIAGE_RETURN &&
        content.charCodeAt(lineBreak + 1) === LINE_FEED
    ) {
        return lineBreak + 2;
    }
    return undefined;
}

function firstClosingEndFrom(
    closing: ClosingLines,
    from: number,
    countSteps: CountSteps,
): number | undefined {
    const startedAt = closing.cursor;
    while (
        closing.cursor < closing.starts.length &&
        (closing.starts[closing.cursor] ?? 0) < from
    ) {
        closing.cursor += 1;
    }
    countSteps(closing.cursor - startedAt + 1);
    return closing.ends[closing.cursor];
}

/**
 * A fence is closed by the first line after it that is exactly as many fence
 * characters as the opener. When no such line follows, shorter lengths are
 * tried in turn, down to three.
 */
function findClosingEnd(
    closers: ReadonlyMap<number, ClosingLines>,
    code: number,
    fenceLength: number,
    bodyStart: number,
    countSteps: CountSteps,
): number | undefined {
    for (let length = fenceLength; length >= MIN_FENCE_LENGTH; length -= 1) {
        countSteps(1);
        const closing = closers.get(closingKey(code, length));
        const end =
            closing && firstClosingEndFrom(closing, bodyStart, countSteps);
        if (end !== undefined) {
            return end;
        }
    }
    return undefined;
}

/**
 * Finds the fenced blocks in time linear in the content. A fence that is
 * never closed hides nothing, so a file of unclosed fences costs one lookup
 * per fence line.
 */
function findFencedRegions(
    content: string,
    countSteps: CountSteps,
): RegionList {
    const { fenceLines, closers } = collectFenceLines(content, countSteps);
    const findLineBreak = createLineBreakFinder(content, countSteps);
    const regions: RegionList = { starts: [], ends: [] };
    let scanFrom = 0;
    for (let line = 0; line < fenceLines.starts.length; line += 1) {
        const start = fenceLines.starts[line] ?? 0;
        const length = fenceLines.lengths[line] ?? 0;
        countSteps(1);
        if (start < scanFrom) {
            continue;
        }
        const bodyStart = fenceBodyStart(
            content,
            start + length,
            findLineBreak,
        );
        if (bodyStart === undefined) {
            continue;
        }
        const end = findClosingEnd(
            closers,
            content.charCodeAt(start),
            length,
            bodyStart,
            countSteps,
        );
        if (end !== undefined) {
            regions.starts.push(start);
            regions.ends.push(end);
            scanFrom = end;
        }
    }
    return regions;
}

/**
 * Answers whether an index falls inside any region, in logarithmic time per
 * question: the regions are ordered by start, each carries the furthest end
 * reached so far, and a binary search finds the last region that starts at or
 * before the index.
 */
function createRegionLookup(
    regions: RegionList,
    countSteps: CountSteps,
): (index: number) => boolean {
    const furthestEnds: number[] = [];
    let furthest = 0;
    for (const end of regions.ends) {
        furthest = Math.max(furthest, end);
        furthestEnds.push(furthest);
    }
    countSteps(furthestEnds.length);
    return (index) => {
        let low = 0;
        let high = regions.starts.length - 1;
        let lastStartingAtOrBefore = -1;
        while (low <= high) {
            countSteps(1);
            const middle = (low + high) >> 1;
            if ((regions.starts[middle] ?? 0) <= index) {
                lastStartingAtOrBefore = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        return (
            lastStartingAtOrBefore >= 0 &&
            (furthestEnds[lastStartingAtOrBefore] ?? 0) > index
        );
    };
}

function findInlineRegions(
    content: string,
    isInsideFence: (index: number) => boolean,
    countSteps: CountSteps,
): RegionList {
    const regions: RegionList = { starts: [], ends: [] };
    for (const match of content.matchAll(INLINE_CODE_RE)) {
        countSteps(1);
        const start = match.index ?? 0;
        if (!isInsideFence(start)) {
            regions.starts.push(start);
            regions.ends.push(start + match[0].length);
        }
    }
    return regions;
}

/** Merges two lists that are each ordered by start into one. */
function mergeRegionLists(
    first: RegionList,
    second: RegionList,
    countSteps: CountSteps,
): RegionList {
    countSteps(first.starts.length + second.starts.length);
    const merged: RegionList = { starts: [], ends: [] };
    let a = 0;
    let b = 0;
    while (a < first.starts.length || b < second.starts.length) {
        const takeFirst =
            b >= second.starts.length ||
            (a < first.starts.length &&
                (first.starts[a] ?? 0) <= (second.starts[b] ?? 0));
        const source = takeFirst ? first : second;
        const position = takeFirst ? a : b;
        merged.starts.push(source.starts[position] ?? 0);
        merged.ends.push(source.ends[position] ?? 0);
        if (takeFirst) {
            a += 1;
        } else {
            b += 1;
        }
    }
    return merged;
}

function findCodeRegions(content: string, countSteps: CountSteps): RegionList {
    const fenced = findFencedRegions(content, countSteps);
    const inline = findInlineRegions(
        content,
        createRegionLookup(fenced, countSteps),
        countSteps,
    );
    return mergeRegionLists(fenced, inline, countSteps);
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
export function findImportTokens(
    content: string,
    countSteps: CountSteps = ignoreSteps,
): ImportToken[] {
    const isInsideCode = createRegionLookup(
        findCodeRegions(content, countSteps),
        countSteps,
    );
    const tokens: ImportToken[] = [];
    for (const match of content.matchAll(HARD_IMPORT_RE)) {
        countSteps(1);
        const start = match.index ?? 0;
        const target = match[1] ?? "";
        if (isInsideCode(start) || isQuoted(target)) {
            continue;
        }
        const rawTarget = target.replaceAll("\\ ", " ");
        tokens.push({
            start,
            end: start + match[0].length,
            rawTarget,
            looksLikePath: looksLikePath(rawTarget),
        });
    }
    return tokens;
}
