import type { ConsolaInstance } from "consola";
import type { Severity } from "../entities/criteria-schema.js";
import type { FindingCategory } from "../entities/edge-types.js";
import type { Finding } from "../entities/finding.js";
import type { IntentLoadReport } from "../entities/intent-load.js";
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

const NAMED_ESCAPES: Readonly<Record<string, string>> = {
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
};

function escapeControlCharacter(character: string): string {
    return (
        NAMED_ESCAPES[character] ??
        `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
    );
}

function isLineBreakOrControlCode(code: number): boolean {
    const isC0Control = code <= 0x1f;
    const isDeleteOrC1Control = code >= 0x7f && code <= 0x9f;
    const isUnicodeLineSeparator = code === 0x2028 || code === 0x2029;
    return isC0Control || isDeleteOrC1Control || isUnicodeLineSeparator;
}

function escapeForTerminal(text: string): string {
    return Array.from(text, (character) =>
        isLineBreakOrControlCode(character.charCodeAt(0))
            ? escapeControlCharacter(character)
            : character,
    ).join("");
}

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

function renderIntentLoad(
    intentLoad: IntentLoadReport,
    logger: ConsolaInstance,
): void {
    logger.info(`Intent: ${intentLoad.status}`);
    logger.info(`  Checked path: ${escapeForTerminal(intentLoad.checkedPath)}`);
    if (intentLoad.reason !== undefined) {
        logger.info(`  Reason: ${escapeForTerminal(intentLoad.reason)}`);
    }
    if (intentLoad.issues !== undefined && intentLoad.issues.length > 0) {
        logger.info("  Issues:");
        for (const issue of intentLoad.issues) {
            logger.info(
                `    ${escapeForTerminal(issue.path)}: ${escapeForTerminal(issue.message)}`,
            );
        }
        if (intentLoad.omittedIssueCount !== undefined) {
            logger.info(`    ...and ${intentLoad.omittedIssueCount} more`);
        }
    }
}

function renderHeader(
    summary: SummaryOutput,
    logger: ConsolaInstance,
    snapshotRef?: string,
): void {
    if (snapshotRef) {
        logger.info(`Evidence snapshot: ${escapeForTerminal(snapshotRef)}`);
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
}

export function renderHumanSummary(
    summary: SummaryOutput,
    logger: ConsolaInstance,
    snapshotRef?: string,
): void {
    renderHeader(summary, logger, snapshotRef);
    logger.info(
        "Evaluation skipped (--summary). Run without --summary to check criteria.",
    );
}

export function renderHuman(
    summary: SummaryOutput,
    findings: Finding[],
    logger: ConsolaInstance,
    snapshotRef?: string,
    intentLoad?: IntentLoadReport,
): void {
    renderHeader(summary, logger, snapshotRef);

    if (intentLoad !== undefined) {
        renderIntentLoad(intentLoad, logger);
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
