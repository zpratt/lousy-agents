const STATUS_PREFIX_LENGTH = 3; // "XY " before each path
const NAMED_CHANGE_LIMIT = 5;

function movesFile(entry: string): boolean {
    return /^[RC]|^.[RC]/.test(entry);
}

/**
 * Paths from `git status --porcelain=v1 -z`. A rename or copy entry is followed
 * by a second token holding the old path; it is the same change, so it is not
 * counted again.
 */
export function parseUncommittedPaths(statusOutput: string): string[] {
    const entries = statusOutput.split("\0").filter((entry) => entry !== "");
    const paths: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        paths.push(entry.slice(STATUS_PREFIX_LENGTH));
        if (movesFile(entry)) {
            index += 1;
        }
    }
    return paths;
}

/**
 * The notice that coach saw only what is committed, or null when everything
 * under packages/ is committed. Coach reads Git objects, so uncommitted edits
 * can neither pass nor fail the gate.
 */
export function describeUncommittedChanges(
    paths: readonly string[],
): string | null {
    if (paths.length === 0) {
        return null;
    }
    const single = paths.length === 1;
    const named = paths.slice(0, NAMED_CHANGE_LIMIT).join(", ");
    const remainder =
        paths.length > NAMED_CHANGE_LIMIT
            ? `, and ${paths.length - NAMED_CHANGE_LIMIT} more`
            : "";
    return (
        `architecture gate: coach analyzed the committed HEAD only; ` +
        `${paths.length} uncommitted ${single ? "change" : "changes"} under packages/ ` +
        `${single ? "was" : "were"} not checked (${named}${remainder}). ` +
        `Commit ${single ? "it" : "them"} to include ${single ? "it" : "them"}.`
    );
}
