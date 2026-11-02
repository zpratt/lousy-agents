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
