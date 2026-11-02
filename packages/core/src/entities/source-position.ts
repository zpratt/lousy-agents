/**
 * Pure helpers for mapping string offsets to 1-based line/column positions.
 */

/** 1-based line and column within a text document */
export interface SourcePosition {
    readonly line: number;
    readonly column: number;
}

const LINE_FEED = 0x0a;

/** Receives the number of steps of work the index does, as it does them. */
export type CountSourcePositionSteps = (steps: number) => void;

/**
 * Indexes the line starts of a content once, and answers each offset with a
 * binary search, so mapping many offsets of one content costs the length of
 * the content plus a logarithm per offset, not a rescan from the start.
 * Offsets are clamped to [0, content.length]. Newlines (`\n`) advance the line.
 *
 * @param countSteps Told one step per character when the index is built, and
 * one per comparison when an offset is answered, so a test can show that the
 * work stays linear and logarithmic and not quadratic
 */
export function createSourcePositionIndex(
    content: string,
    countSteps?: CountSourcePositionSteps,
): (offset: number) => SourcePosition {
    const lineStarts = [0];
    for (let i = 0; i < content.length; i += 1) {
        if (content.charCodeAt(i) === LINE_FEED) {
            lineStarts.push(i + 1);
        }
    }
    countSteps?.(content.length);
    return (offset) => {
        const safeOffset = Math.max(0, Math.min(offset, content.length));
        let low = 0;
        let high = lineStarts.length - 1;
        countSteps?.(1);
        while (low < high) {
            countSteps?.(1);
            const middle = (low + high + 1) >> 1;
            if ((lineStarts[middle] ?? 0) <= safeOffset) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }
        return {
            line: low + 1,
            column: safeOffset - (lineStarts[low] ?? 0) + 1,
        };
    };
}

/**
 * Maps a 0-based string offset into a 1-based line and column. To map many
 * offsets of the same content, build one index with createSourcePositionIndex.
 */
export function offsetToSourcePosition(
    content: string,
    offset: number,
): SourcePosition {
    return createSourcePositionIndex(content)(offset);
}
