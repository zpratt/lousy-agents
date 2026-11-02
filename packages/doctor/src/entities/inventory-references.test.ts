import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { Edge, InventoryRecord } from "./edge-types.js";
import { markReferencedRecords } from "./inventory-references.js";

const chance = new Chance();

function inventoryRecord(path: string, edges: Edge[] = []): InventoryRecord {
    return {
        id: `shared:${path}`,
        path,
        harness: "shared",
        constructType: "instruction",
        loadMechanism: "convention-loaded",
        edges,
    };
}

function edge(
    type: Edge["type"],
    from: string,
    to: string | string[],
    malformed = false,
): Edge {
    return {
        type,
        direction: { from, to },
        target: Array.isArray(to) ? to.join(",") : to,
        malformed,
    };
}

describe("markReferencedRecords", () => {
    describe("when a well-formed edge points at a record", () => {
        it.each(["hard-import", "soft-reference"] as const)(
            "should mark the target of a %s edge as referenced",
            (edgeType) => {
                const sourcePath = `${chance.word()}.md`;
                const targetPath = `${chance.word()}-target.md`;
                const records = [
                    inventoryRecord(sourcePath, [
                        edge(edgeType, sourcePath, targetPath),
                    ]),
                    inventoryRecord(targetPath),
                ];

                const result = markReferencedRecords(records);

                expect(result.map((r) => r.loadMechanism)).toEqual([
                    "convention-loaded",
                    "referenced",
                ]);
            },
        );
    });

    describe("when a record imports itself", () => {
        it.each(["hard-import", "soft-reference"] as const)(
            "should not count its own %s edge as a reference to it",
            (edgeType) => {
                const path = `${chance.word()}.md`;
                const records = [
                    inventoryRecord(path, [edge(edgeType, path, path)]),
                ];

                const result = markReferencedRecords(records);

                expect(result.map((r) => r.loadMechanism)).toEqual([
                    "convention-loaded",
                ]);
            },
        );

        it("should still mark it as referenced when another record points at it", () => {
            const path = `${chance.word()}.md`;
            const otherPath = `${chance.word()}-other.md`;
            const records = [
                inventoryRecord(path, [edge("hard-import", path, path)]),
                inventoryRecord(otherPath, [
                    edge("hard-import", otherPath, path),
                ]),
            ];

            const result = markReferencedRecords(records);

            expect(result.map((r) => r.loadMechanism)).toEqual([
                "referenced",
                "convention-loaded",
            ]);
        });
    });

    describe("when an edge does not count as a reference", () => {
        it("should ignore a glob-binding edge even when its target equals a record path", () => {
            const sourcePath = `${chance.word()}.md`;
            const targetPath = `${chance.word()}-target.md`;
            const records = [
                inventoryRecord(sourcePath, [
                    edge("glob-binding", sourcePath, targetPath),
                ]),
                inventoryRecord(targetPath),
            ];

            const result = markReferencedRecords(records);

            expect(result[1].loadMechanism).toBe("convention-loaded");
        });

        it("should ignore a malformed edge even when its target equals a record path", () => {
            const sourcePath = `${chance.word()}.md`;
            const targetPath = `${chance.word()}-target.md`;
            const records = [
                inventoryRecord(sourcePath, [
                    edge("hard-import", sourcePath, targetPath, true),
                ]),
                inventoryRecord(targetPath),
            ];

            const result = markReferencedRecords(records);

            expect(result[1].loadMechanism).toBe("convention-loaded");
        });

        it("should ignore an edge whose target is a list of paths", () => {
            const sourcePath = `${chance.word()}.md`;
            const targetPath = `${chance.word()}-target.md`;
            const records = [
                inventoryRecord(sourcePath, [
                    edge("soft-reference", sourcePath, [targetPath]),
                ]),
                inventoryRecord(targetPath),
            ];

            const result = markReferencedRecords(records);

            expect(result[1].loadMechanism).toBe("convention-loaded");
        });

        it("should leave a record referenced by no edge convention-loaded", () => {
            const records = [
                inventoryRecord(`${chance.word()}.md`),
                inventoryRecord(`${chance.word()}-other.md`),
            ];

            const result = markReferencedRecords(records);

            expect(result.map((r) => r.loadMechanism)).toEqual([
                "convention-loaded",
                "convention-loaded",
            ]);
        });
    });

    describe("when marking records", () => {
        it("should preserve record order and every other field", () => {
            const sourcePath = `${chance.word()}.md`;
            const targetPath = `${chance.word()}-target.md`;
            const sourceEdge = edge("hard-import", sourcePath, targetPath);
            const records = [
                inventoryRecord(sourcePath, [sourceEdge]),
                inventoryRecord(targetPath),
            ];

            const result = markReferencedRecords(records);

            expect(result).toStrictEqual([
                inventoryRecord(sourcePath, [sourceEdge]),
                { ...inventoryRecord(targetPath), loadMechanism: "referenced" },
            ]);
        });

        it("should not mutate the records it is given", () => {
            const sourcePath = `${chance.word()}.md`;
            const targetPath = `${chance.word()}-target.md`;
            const target = inventoryRecord(targetPath);
            const records = [
                inventoryRecord(sourcePath, [
                    edge("hard-import", sourcePath, targetPath),
                ]),
                target,
            ];

            markReferencedRecords(records);

            expect(target.loadMechanism).toBe("convention-loaded");
        });
    });
});
