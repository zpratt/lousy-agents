import type { Finding } from "../entities/finding.js";

/**
 * An advisory about the whole scan rather than one construct: a
 * repository-level target in the same `all:<scope>` form as the other
 * findings, visible in every report and never failing `--ci`. It rides on the
 * existing findings model, so it adds no report field.
 */
export function repositoryNotice(
    criterionId: string,
    description: string,
): Finding {
    return {
        id: `${criterionId}:all:repository`,
        criterionId,
        targetId: "all:repository",
        severity: "medium",
        category: "governance",
        classification: "advisory",
        intentGated: false,
        assumedIntent: false,
        description,
    };
}
