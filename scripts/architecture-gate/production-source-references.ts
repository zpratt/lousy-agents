// tsc reads a directive's name as the token right after `<`, in any letter
// case, and a comment has no escapes, so every directive it honours has this
// text on its own line. Matching the tag and nothing else means no attribute
// order, quoting or leading comment can hide one.
const REFERENCE_TAG = /<reference/i;

/**
 * The 1-based numbers of the lines that hold a triple-slash reference
 * directive's tag, `<reference`. A `/// <reference path="…" />` pulls a file
 * into the program as an import does, and coach 0.12.0 does not count it as
 * one, so a layer rule would not see it. `types` and `lib` references are
 * refused as well, since telling them from `path` means reading attributes,
 * and no file here uses any. A line that only mentions the tag, in a string
 * for instance, is flagged too: that noise is accepted.
 */
export function referenceDirectiveLines(content: string): number[] {
    return content
        .split("\n")
        .flatMap((line, index) =>
            REFERENCE_TAG.test(line) ? [index + 1] : [],
        );
}
