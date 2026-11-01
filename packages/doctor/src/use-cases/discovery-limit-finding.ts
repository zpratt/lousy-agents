import type { Finding } from "../entities/finding.js";

/** The directory limit a scan stopped at. */
export interface DiscoveryDirectoryLimit {
    readonly maxDirectories: number;
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
): Finding[] {
    const reasons = [
        ...(directoryLimit === undefined
            ? []
            : [
                  `The repository scan stopped after listing ${directoryLimit.maxDirectories} directories, so agentic constructs in the remaining directories are not in this report.`,
              ]),
        ...(depthLimit === undefined
            ? []
            : [
                  `The repository scan did not go more than ${depthLimit.maxDepth} directories deep, so agentic constructs in deeper directories are not in this report.`,
              ]),
    ];
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
