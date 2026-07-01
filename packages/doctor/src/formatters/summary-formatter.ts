import type { ArchetypeClassification } from "../entities/archetype.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import { countCrossHarnessEdges } from "../lib/cross-harness-edges.js";

const ARCHETYPE_DESCRIPTIONS: Record<
    ArchetypeClassification["archetype"],
    string
> = {
    pure: "Single-harness configuration. One AI coding assistant dominates the repository.",
    "intentional-hybrid":
        "Multi-harness configuration with cross-harness references. Harnesses deliberately share context.",
    "canonical-contract":
        "Shared AGENTS.md contract. All harnesses read from a single canonical instruction file.",
    "accidental-sprawl":
        "Multiple harnesses configured without cross-referencing. May indicate legacy or uncoordinated setup.",
    none: "No agentic configuration detected.",
    ambiguous: "Configuration does not fit a single archetype cleanly.",
};

export interface SummaryOutput {
    archetype: ArchetypeClassification["archetype"];
    archetypeDescription: string;
    dominanceScore: number;
    totalRecords: number;
    harnessBreakdown: Array<{ harness: string; count: number }>;
    crossHarnessEdges: number;
}

export function formatSummary(
    records: InventoryRecord[],
    classification: ArchetypeClassification,
): SummaryOutput {
    const counts = new Map<string, number>();
    for (const r of records) {
        counts.set(r.harness, (counts.get(r.harness) ?? 0) + 1);
    }

    const harnessBreakdown = Array.from(counts.entries())
        .map(([harness, count]) => ({ harness, count }))
        .sort((a, b) => a.harness.localeCompare(b.harness));

    const crossHarnessEdges = countCrossHarnessEdges(records);

    return {
        archetype: classification.archetype,
        archetypeDescription: ARCHETYPE_DESCRIPTIONS[classification.archetype],
        dominanceScore: classification.dominanceScore,
        totalRecords: records.length,
        harnessBreakdown,
        crossHarnessEdges,
    };
}
