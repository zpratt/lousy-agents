/**
 * The one wording for a directory walk that stopped at a limit, shared by lint
 * (instruction/discovery-limit-reached) and doctor (discovery-limit-reached)
 * so the two cannot describe the same limits differently. Each caller says
 * what it was looking for and what the user should take from the gap.
 */

/** The limits a walk reached; a limit it did not reach is left out. */
export interface DiscoveryLimitsReached {
    readonly maxDirectories?: number;
    readonly maxDepth?: number;
    readonly maxEntries?: number;
}

/**
 * - `subject`: what stopped, as the start of a sentence ("The repository scan")
 * - `missing`: what may be absent from the result ("agentic constructs")
 * - `consequence`: what that means for it ("are not in this report")
 */
export interface DiscoveryLimitWording {
    readonly subject: string;
    readonly missing: string;
    readonly consequence: string;
}

/** One sentence for each limit that was reached: directories, depth, entries. */
export function describeDiscoveryLimits(
    reached: DiscoveryLimitsReached,
    { subject, missing, consequence }: DiscoveryLimitWording,
): string[] {
    const sentences: string[] = [];
    if (reached.maxDirectories !== undefined) {
        sentences.push(
            `${subject} stopped after listing ${reached.maxDirectories} directories, so ${missing} in the remaining directories ${consequence}.`,
        );
    }
    if (reached.maxDepth !== undefined) {
        sentences.push(
            `${subject} did not go more than ${reached.maxDepth} directories deep, so ${missing} in deeper directories ${consequence}.`,
        );
    }
    if (reached.maxEntries !== undefined) {
        sentences.push(
            `${subject} stopped after examining ${reached.maxEntries} directory entries, so ${missing} in the remaining entries ${consequence}.`,
        );
    }
    return sentences;
}

/** How many paths a message names before it counts the rest. */
const NAMED_PATHS = 5;

/**
 * The first few paths joined with commas, and a count of the rest, so a
 * message about a fan-out stays readable: "a, b, c, d, e, and 3 more".
 */
export function listPaths(paths: readonly string[]): string {
    const listed = paths.slice(0, NAMED_PATHS).join(", ");
    const unlisted = paths.length - NAMED_PATHS;
    return unlisted > 0 ? `${listed}, and ${unlisted} more` : listed;
}

/**
 * The message for instruction file discovery skipping symbolic links that
 * point outside the repository, so their targets were not analyzed.
 */
export function describeSkippedSymlinks(paths: readonly string[]): string {
    return `Instruction file discovery skipped ${paths.length} symbolic link(s) that point outside the repository, so their targets were not analyzed: ${listPaths(paths)}. Replace a link with a file inside the repository to have it analyzed.`;
}
