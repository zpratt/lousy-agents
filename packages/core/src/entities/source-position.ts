/**
 * Pure helpers for mapping string offsets to 1-based line/column positions.
 */

/** 1-based line and column within a text document */
export interface SourcePosition {
    readonly line: number;
    readonly column: number;
}

/**
 * Maps a 0-based string offset into a 1-based line and column.
 * Offsets are clamped to [0, content.length]. Newlines (`\n`) advance the line.
 */
export function offsetToSourcePosition(
    content: string,
    offset: number,
): SourcePosition {
    const safeOffset = Math.max(0, Math.min(offset, content.length));
    let line = 1;
    let column = 1;
    for (let i = 0; i < safeOffset; i++) {
        if (content[i] === "\n") {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    return { line, column };
}
