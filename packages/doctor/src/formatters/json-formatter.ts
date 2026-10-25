import { z } from "zod";
import type { InventoryRecord } from "../entities/edge-types.js";
import type { Finding } from "../entities/finding.js";
import {
    INTENT_LOAD_STATUSES,
    type IntentLoadReport,
} from "../entities/intent-load.js";
import {
    buildHarnessByPath,
    isCrossHarnessTarget,
    resolveEdgeTargets,
} from "../lib/cross-harness-edges.js";
import type { SummaryOutput } from "./summary-formatter.js";

const HarnessNameSchema = z.enum([
    "claude",
    "copilot",
    "codex",
    "antigravity",
    "hermes",
    "crush",
    "pi",
    "shared",
]);

const ConstructTypeSchema = z.enum([
    "instruction",
    "skill",
    "agent",
    "subagent",
    "mcp-server",
    "plugin",
    "hook",
]);

const EdgeTypeSchema = z.enum([
    "hard-import",
    "soft-reference",
    "glob-binding",
]);

const ArchetypeSchema = z.enum([
    "pure",
    "intentional-hybrid",
    "canonical-contract",
    "accidental-sprawl",
    "none",
    "ambiguous",
]);

const CitationHandleSchema = z.object({
    nodeId: z.string(),
    sourceFile: z.string(),
    lineRange: z.tuple([z.number(), z.number()]).optional(),
    snapshotRef: z.string().optional(),
});

const FindingSchema = z.object({
    id: z.string(),
    criterionId: z.string(),
    targetId: z.string(),
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
    category: z.enum([
        "missing-required",
        "malformed-reference",
        "wrong-direction",
        "drift",
        "governance",
        "composition-style",
    ]),
    classification: z.enum(["defect", "advisory", "info"]),
    intentGated: z.boolean(),
    assumedIntent: z.boolean(),
    description: z.string(),
    evidenceCitation: CitationHandleSchema.optional(),
    snapshotRef: z.string().optional(),
});

const IntentLoadReportSchema = z.object({
    status: z.enum(INTENT_LOAD_STATUSES),
    checkedPath: z.string(),
    reason: z.string().optional(),
    issues: z
        .array(z.object({ path: z.string(), message: z.string() }))
        .optional(),
    omittedIssueCount: z.number().int().positive().optional(),
});

const ReportInventoryItemSchema = z.object({
    id: z.string(),
    path: z.string(),
    harness: HarnessNameSchema,
    constructType: ConstructTypeSchema,
    loadMechanism: z.enum(["referenced", "convention-loaded"]),
    serverName: z.string().optional(),
    transport: z.string().optional(),
});

const ReportEdgeSchema = z.object({
    from: z.string(),
    to: z.string(),
    type: EdgeTypeSchema,
    malformed: z.boolean(),
    reason: z.enum(["missing-target", "path-traversal"]).optional(),
    crossHarness: z.boolean(),
});

const ArchetypeFieldsSchema = z.object({
    archetype: ArchetypeSchema,
    dominanceScore: z.number(),
    totalRecords: z.number(),
    harnessBreakdown: z.array(
        z.object({ harness: z.string(), count: z.number() }),
    ),
    crossHarnessEdges: z.number(),
});

export const ReportJsonSchema = ArchetypeFieldsSchema.extend({
    evaluation: z.literal("completed"),
    inventory: z.array(ReportInventoryItemSchema),
    edges: z.array(ReportEdgeSchema),
    intent: IntentLoadReportSchema.optional(),
    findings: z.array(FindingSchema),
    snapshotRef: z.string().optional(),
});

export type ReportInventoryItem = z.infer<typeof ReportInventoryItemSchema>;
export type ReportEdge = z.infer<typeof ReportEdgeSchema>;
export type ReportJson = z.infer<typeof ReportJsonSchema>;

const SummaryReportJsonSchema = ArchetypeFieldsSchema.extend({
    evaluation: z.literal("skipped"),
    inventory: z.array(ReportInventoryItemSchema),
});

export type SummaryReportJson = z.infer<typeof SummaryReportJsonSchema>;

export function toInventoryItems(
    records: InventoryRecord[],
): ReportInventoryItem[] {
    return records
        .map(
            (record): ReportInventoryItem => ({
                id: record.id,
                path: record.path,
                harness: record.harness,
                constructType: record.constructType,
                loadMechanism: record.loadMechanism,
                ...(record.serverName !== undefined
                    ? { serverName: record.serverName }
                    : {}),
                ...(record.transport !== undefined
                    ? { transport: record.transport }
                    : {}),
            }),
        )
        .sort(
            (a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id),
        );
}

export function toReportEdges(records: InventoryRecord[]): ReportEdge[] {
    const harnessByPath = buildHarnessByPath(records);
    const result: ReportEdge[] = [];

    for (const record of records) {
        for (const edge of record.edges) {
            for (const target of resolveEdgeTargets(edge)) {
                result.push({
                    from: edge.direction.from,
                    to: target,
                    type: edge.type,
                    malformed: edge.malformed,
                    ...(edge.reason !== undefined
                        ? { reason: edge.reason }
                        : {}),
                    crossHarness: isCrossHarnessTarget(
                        edge,
                        target,
                        record.harness,
                        harnessByPath,
                    ),
                });
            }
        }
    }

    return result;
}

export function toJson(
    summary: SummaryOutput,
    findings: Finding[],
    records: InventoryRecord[],
    snapshotRef?: string,
    intentLoad?: IntentLoadReport,
): ReportJson {
    const edges = toReportEdges(records);

    const report = {
        archetype: summary.archetype,
        dominanceScore: summary.dominanceScore,
        totalRecords: summary.totalRecords,
        harnessBreakdown: summary.harnessBreakdown,
        crossHarnessEdges: edges.filter((edge) => edge.crossHarness).length,
        evaluation: "completed",
        inventory: toInventoryItems(records),
        edges,
        ...(intentLoad !== undefined ? { intent: intentLoad } : {}),
        findings,
        ...(snapshotRef !== undefined ? { snapshotRef } : {}),
    };

    return ReportJsonSchema.parse(report);
}

export function toSummaryJson(
    summary: SummaryOutput,
    records: InventoryRecord[],
): SummaryReportJson {
    return SummaryReportJsonSchema.parse({
        archetype: summary.archetype,
        dominanceScore: summary.dominanceScore,
        totalRecords: summary.totalRecords,
        harnessBreakdown: summary.harnessBreakdown,
        crossHarnessEdges: summary.crossHarnessEdges,
        evaluation: "skipped",
        inventory: toInventoryItems(records),
    });
}
