import type { InventoryRecord } from "./edge-types.js";

/**
 * Paths that some well-formed hard-import or soft-reference edge points to,
 * leaving out an edge from a file to itself: a file that only imports itself
 * is not referenced by anything.
 */
function referencedPaths(records: readonly InventoryRecord[]): Set<string> {
    return new Set(
        records
            .flatMap((record) => record.edges)
            .flatMap((edge) =>
                !edge.malformed &&
                edge.type !== "glob-binding" &&
                typeof edge.direction.to === "string" &&
                edge.direction.to !== edge.direction.from
                    ? [edge.direction.to]
                    : [],
            ),
    );
}

/**
 * Returns the records with `loadMechanism: "referenced"` on every record that
 * another record's well-formed edge points to.
 */
export function markReferencedRecords(
    records: readonly InventoryRecord[],
): InventoryRecord[] {
    const referenced = referencedPaths(records);

    return records.map((record) =>
        referenced.has(record.path)
            ? { ...record, loadMechanism: "referenced" }
            : record,
    );
}
