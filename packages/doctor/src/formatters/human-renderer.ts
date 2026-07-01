import type { ConsolaInstance } from "consola";
import type { Severity } from "../entities/criteria-schema.js";
import type { FindingCategory } from "../entities/edge-types.js";
import type { Finding } from "../entities/finding.js";
import type { SummaryOutput } from "./summary-formatter.js";

const SEVERITY_ORDER: Severity[] = [
    "critical",
    "high",
    "medium",
    "low",
    "info",
];

const CATEGORY_ORDER: FindingCategory[] = [
    "missing-required",
    "malformed-reference",
    "wrong-direction",
    "drift",
    "governance",
    "composition-style",
];

function sortFindings(findings: Finding[]): Finding[] {
    return [...findings].sort((a, b) => {
        const severityDiff =
            SEVERITY_ORDER.indexOf(a.severity) -
            SEVERITY_ORDER.indexOf(b.severity);
        if (severityDiff !== 0) return severityDiff;
        return (
            CATEGORY_ORDER.indexOf(a.category) -
            CATEGORY_ORDER.indexOf(b.category)
        );
    });
}

export function renderHuman(
    summary: SummaryOutput,
    findings: Finding[],
    logger: ConsolaInstance,
    snapshotRef?: string,
): void {
    if (snapshotRef) {
        logger.info(`Evidence snapshot: ${snapshotRef}`);
    }

    logger.info(`Archetype: ${summary.archetype}`);
    logger.info(`  ${summary.archetypeDescription}`);
    logger.info(
        `  Dominance score: ${(summary.dominanceScore * 100).toFixed(0)}%`,
    );
    logger.info(`  Total records: ${summary.totalRecords}`);

    if (summary.harnessBreakdown.length > 0) {
        logger.info("  Harness breakdown:");
        for (const { harness, count } of summary.harnessBreakdown) {
            logger.info(`    ${harness}: ${count}`);
        }
    }

    if (summary.crossHarnessEdges > 0) {
        logger.info(`  Cross-harness edges: ${summary.crossHarnessEdges}`);
    }

    if (findings.length === 0) {
        logger.success("No findings.");
        return;
    }

    logger.info(`\nFindings (${findings.length}):`);
    const sorted = sortFindings(findings);
    for (const finding of sorted) {
        const severityTag = `[${finding.severity.toUpperCase()}]`;
        const classTag = `[${finding.classification}]`;
        const assumedTag = finding.assumedIntent ? " [assumed intent]" : "";
        logger.info(
            `  ${severityTag}${classTag} ${finding.criterionId}: ${finding.description}${assumedTag}`,
        );
        if (finding.evidenceCitation) {
            logger.info(
                `    Evidence: node ${finding.evidenceCitation.nodeId} (${finding.evidenceCitation.sourceFile})`,
            );
        }
    }
}

export function hasBlockingFindings(findings: Finding[]): boolean {
    return findings.some(
        (f) =>
            (f.severity === "critical" || f.severity === "high") &&
            f.classification === "defect",
    );
}
