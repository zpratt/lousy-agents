import type { InventoryRecord } from "../entities/edge-types.js";

export const PURE_DOMINANCE_THRESHOLD = 0.8;

export interface HarnessProfile {
    harness: string;
    recordCount: number;
    edgeCount: number;
    share: number;
}

export function buildHarnessProfiles(
    records: InventoryRecord[],
): HarnessProfile[] {
    if (records.length === 0) return [];

    const data = new Map<string, { records: number; edges: number }>();
    for (const record of records) {
        const existing = data.get(record.harness) ?? { records: 0, edges: 0 };
        data.set(record.harness, {
            records: existing.records + 1,
            edges: existing.edges + record.edges.length,
        });
    }

    const totalWeight = records.reduce((acc, r) => acc + 1 + r.edges.length, 0);

    return Array.from(data.entries()).map(
        ([harness, { records: recordCount, edges: edgeCount }]) => ({
            harness,
            recordCount,
            edgeCount,
            share:
                totalWeight > 0 ? (recordCount + edgeCount) / totalWeight : 0,
        }),
    );
}
