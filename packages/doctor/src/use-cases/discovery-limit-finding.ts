import {
    type DiscoveryLimitWording,
    describeDiscoveryLimits,
} from "@lousy-agents/core/entities/discovery-limit-message.js";
import type { Finding } from "../entities/finding.js";
import { repositoryNotice } from "./repository-notice.js";

const SCAN_WORDING: DiscoveryLimitWording = {
    subject: "The repository scan",
    missing: "agentic constructs",
    consequence: "are not in this report",
};

/** The directory limit a scan stopped at. */
export interface DiscoveryDirectoryLimit {
    readonly maxDirectories: number;
}

/** The entry budget a scan stopped at. */
export interface DiscoveryEntryLimit {
    readonly maxEntries: number;
}

/** The depth below which a scan left directories unentered. */
export interface DiscoveryDepthLimit {
    readonly maxDepth: number;
}

/**
 * The finding that tells a user the scan stopped listing directories or did
 * not enter deeper ones, so the inventory may be missing constructs. It is
 * advisory (medium, not a defect), so it is always visible but never fails
 * `--ci`.
 */
export function discoveryLimitFindings(
    directoryLimit: DiscoveryDirectoryLimit | undefined,
    depthLimit?: DiscoveryDepthLimit,
    entryLimit?: DiscoveryEntryLimit,
): Finding[] {
    const reasons = describeDiscoveryLimits(
        {
            ...(directoryLimit === undefined
                ? {}
                : { maxDirectories: directoryLimit.maxDirectories }),
            ...(depthLimit === undefined
                ? {}
                : { maxDepth: depthLimit.maxDepth }),
            ...(entryLimit === undefined
                ? {}
                : { maxEntries: entryLimit.maxEntries }),
        },
        SCAN_WORDING,
    );
    return reasons.length === 0
        ? []
        : [repositoryNotice("discovery-limit-reached", reasons.join(" "))];
}
