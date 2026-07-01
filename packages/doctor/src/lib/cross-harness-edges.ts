import type {
    Edge,
    HarnessName,
    InventoryRecord,
} from "../entities/edge-types.js";

export function resolveEdgeTargets(edge: Edge): string[] {
    return Array.isArray(edge.direction.to)
        ? edge.direction.to
        : [edge.direction.to];
}

export function buildHarnessByPath(
    records: InventoryRecord[],
): Map<string, HarnessName> {
    const harnessByPath = new Map<string, HarnessName>();
    for (const record of records) {
        harnessByPath.set(record.path, record.harness);
    }
    return harnessByPath;
}

export function isCrossHarnessTarget(
    edge: Edge,
    targetPath: string,
    sourceHarness: HarnessName,
    harnessByPath: Map<string, HarnessName>,
): boolean {
    if (edge.malformed || edge.type === "glob-binding") return false;
    const targetHarness = harnessByPath.get(targetPath);
    return targetHarness !== undefined && targetHarness !== sourceHarness;
}

export function countCrossHarnessEdges(records: InventoryRecord[]): number {
    const harnessByPath = buildHarnessByPath(records);
    let count = 0;
    for (const record of records) {
        for (const edge of record.edges) {
            for (const target of resolveEdgeTargets(edge)) {
                if (
                    isCrossHarnessTarget(
                        edge,
                        target,
                        record.harness,
                        harnessByPath,
                    )
                ) {
                    count++;
                }
            }
        }
    }
    return count;
}
