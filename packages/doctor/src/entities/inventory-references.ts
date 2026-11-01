import type { InventoryRecord } from "./edge-types.js";

/** Paths that some well-formed hard-import or soft-reference edge points to. */
function referencedPaths(records: readonly InventoryRecord[]): Set<string> {
    return new Set(
        records
            .flatMap((record) => record.edges)
            .flatMap((edge) =>
                !edge.malformed &&
                edge.type !== "glob-binding" &&
                typeof edge.direction.to === "string"
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
