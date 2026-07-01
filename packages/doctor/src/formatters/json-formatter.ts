import type { Archetype } from "../entities/archetype.js";
import type { Finding } from "../entities/finding.js";
import type { SummaryOutput } from "./summary-formatter.js";

export interface ReportJson {
    archetype: Archetype;
    dominanceScore: number;
    totalRecords: number;
    harnessBreakdown: Array<{ harness: string; count: number }>;
    crossHarnessEdges: number;
    findings: Finding[];
    snapshotRef?: string;
}

export function toJson(
    summary: SummaryOutput,
    findings: Finding[],
    snapshotRef?: string,
): ReportJson {
    return {
        archetype: summary.archetype,
        dominanceScore: summary.dominanceScore,
        totalRecords: summary.totalRecords,
        harnessBreakdown: summary.harnessBreakdown,
        crossHarnessEdges: summary.crossHarnessEdges,
        findings,
        ...(snapshotRef !== undefined ? { snapshotRef } : {}),
    };
}
