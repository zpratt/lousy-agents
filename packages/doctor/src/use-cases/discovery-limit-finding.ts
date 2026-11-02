import {
    type DiscoveryLimitWording,
    describeDiscoveryLimits,
} from "@lousy-agents/core/entities/discovery-limit-message.js";
import type { Finding } from "../entities/finding.js";

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
 * not enter deeper ones, so the inventory may be missing constructs. It is advisory (medium, not a defect),
 * so it is always visible but never fails `--ci`.
 *
 * It rides on the existing findings model: a repository-level target in the
 * same `all:<scope>` form as the other findings, and no new report field.
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
        : [
              {
                  id: "discovery-limit-reached:all:repository",
                  criterionId: "discovery-limit-reached",
                  targetId: "all:repository",
                  severity: "medium",
                  category: "governance",
                  classification: "advisory",
                  intentGated: false,
                  assumedIntent: false,
                  description: reasons.join(" "),
              },
          ];
}
