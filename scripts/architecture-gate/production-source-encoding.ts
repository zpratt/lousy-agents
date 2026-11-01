const UTF16_LITTLE_ENDIAN_MARK = [0xff, 0xfe];
const UTF16_BIG_ENDIAN_MARK = [0xfe, 0xff];
const UTF8_MARK = [0xef, 0xbb, 0xbf];

function startsWithMark(content: Buffer, mark: readonly number[]): boolean {
    return content.subarray(0, mark.length).equals(Buffer.from(mark));
}

/**
 * What is wrong with a source file's bytes, or undefined when nothing is.
 * tsc reads a file saved as UTF-16, but coach does not
 * (lousy-agents/coach#585), so such a file would hide its imports from the
 * layer rules while typecheck stays green. Coach does read a UTF-8 byte-order
 * mark, so that one is rejected only for uniformity: this repository's
 * sources have none, and the rule keeps it so.
 */
export function encodingProblem(content: Buffer): string | undefined {
    if (
        [UTF16_LITTLE_ENDIAN_MARK, UTF16_BIG_ENDIAN_MARK].some((mark) =>
            startsWithMark(content, mark),
        )
    ) {
        return "is UTF-16, which coach does not read (lousy-agents/coach#585)";
    }
    if (startsWithMark(content, UTF8_MARK)) {
        return "starts with a UTF-8 byte-order mark: rejected for uniformity (coach reads it, but sources here are UTF-8 without one)";
    }
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(content);
        return undefined;
    } catch {
        return "is not valid UTF-8, which coach does not read";
    }
}
