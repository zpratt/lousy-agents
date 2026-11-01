import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { Edge, InventoryRecord } from "../entities/edge-types.js";
import type { Finding } from "../entities/finding.js";
import {
    INTENT_LOAD_STATUSES,
    type IntentLoadReport,
} from "../entities/intent-load.js";
import { ReportJsonSchema, toJson, toSummaryJson } from "./json-formatter.js";
import type { SummaryOutput } from "./summary-formatter.js";

const chance = new Chance();

function buildSummary(overrides: Partial<SummaryOutput> = {}): SummaryOutput {
    return {
        archetype: "pure",
        archetypeDescription: chance.sentence(),
        dominanceScore: chance.floating({ min: 0, max: 1 }),
        totalRecords: 0,
        harnessBreakdown: [],
        crossHarnessEdges: 0,
        ...overrides,
    };
}

function buildRecord(
    overrides: Partial<InventoryRecord> = {},
): InventoryRecord {
    const word = chance.word();
    return {
        id: `claude:${word}.md`,
        path: `${word}.md`,
        harness: "claude",
        constructType: "instruction",
        loadMechanism: "convention-loaded",
        edges: [],
        ...overrides,
    };
}

function buildEdge(overrides: Partial<Edge> = {}): Edge {
    return {
        type: "hard-import",
        direction: { from: "a.md", to: "b.md" },
        target: "b.md",
        malformed: false,
        ...overrides,
    };
}

describe("toJson", () => {
    describe("inventory projection", () => {
        it("should include an inventory array with one entry per record", () => {
            const records = [buildRecord(), buildRecord(), buildRecord()];
            const summary = buildSummary({ totalRecords: records.length });

            const report = toJson(summary, [], records);

            expect(report.inventory).toHaveLength(records.length);
        });

        it("should project id, path, harness, constructType, and loadMechanism for each entry", () => {
            const record = buildRecord({
                id: "claude:CLAUDE.md",
                path: "CLAUDE.md",
                harness: "claude",
                constructType: "instruction",
                loadMechanism: "referenced",
            });
            const summary = buildSummary({ totalRecords: 1 });

            const report = toJson(summary, [], [record]);

            expect(report.inventory[0]).toEqual({
                id: record.id,
                path: record.path,
                harness: record.harness,
                constructType: record.constructType,
                loadMechanism: record.loadMechanism,
            });
        });

        it("should project serverName and transport for mcp-server entries", () => {
            const record = buildRecord({
                id: "mcp-server:.mcp.json#filesystem",
                path: ".mcp.json",
                constructType: "mcp-server",
                serverName: "filesystem",
                transport: "stdio",
            });
            const summary = buildSummary({ totalRecords: 1 });

            const report = toJson(summary, [], [record]);

            expect(report.inventory[0].serverName).toBe("filesystem");
            expect(report.inventory[0].transport).toBe("stdio");
        });

        it("should omit serverName and transport for non-mcp-server entries", () => {
            const record = buildRecord({ constructType: "instruction" });
            const summary = buildSummary({ totalRecords: 1 });

            const report = toJson(summary, [], [record]);

            expect(report.inventory[0].serverName).toBeUndefined();
            expect(report.inventory[0].transport).toBeUndefined();
        });

        it("should order inventory entries by path", () => {
            const zebra = buildRecord({
                id: "claude:zebra.md",
                path: "zebra.md",
            });
            const apple = buildRecord({
                id: "claude:apple.md",
                path: "apple.md",
            });
            const summary = buildSummary({ totalRecords: 2 });

            const report = toJson(summary, [], [zebra, apple]);

            expect(report.inventory.map((i) => i.path)).toEqual([
                "apple.md",
                "zebra.md",
            ]);
        });

        it("should emit an empty inventory array when there are no records", () => {
            const summary = buildSummary({ totalRecords: 0 });

            const report = toJson(summary, [], []);

            expect(report.inventory).toEqual([]);
        });
    });

    describe("edges projection", () => {
        it("should project every edge from every inventory record", () => {
            const source = buildRecord({
                path: "a.md",
                edges: [buildEdge({ direction: { from: "a.md", to: "b.md" } })],
            });
            const target = buildRecord({ path: "b.md" });
            const summary = buildSummary({ totalRecords: 2 });

            const report = toJson(summary, [], [source, target]);

            expect(report.edges).toHaveLength(1);
        });

        it("should include from, to, type, malformed, and crossHarness fields", () => {
            const source = buildRecord({
                path: "a.md",
                harness: "claude",
                edges: [
                    buildEdge({
                        type: "hard-import",
                        direction: { from: "a.md", to: "b.md" },
                        malformed: false,
                    }),
                ],
            });
            const target = buildRecord({ path: "b.md", harness: "copilot" });
            const summary = buildSummary({ totalRecords: 2 });

            const report = toJson(summary, [], [source, target]);

            expect(report.edges[0]).toEqual({
                from: "a.md",
                to: "b.md",
                type: "hard-import",
                malformed: false,
                crossHarness: true,
            });
        });

        it("should set crossHarness to true only when source and target harnesses differ", () => {
            const claudeSource = buildRecord({
                path: "a.md",
                harness: "claude",
                edges: [
                    buildEdge({ direction: { from: "a.md", to: "same.md" } }),
                ],
            });
            const claudeTarget = buildRecord({
                path: "same.md",
                harness: "claude",
            });
            const summary = buildSummary({ totalRecords: 2 });

            const report = toJson(summary, [], [claudeSource, claudeTarget]);

            expect(report.edges[0].crossHarness).toBe(false);
        });

        it("should always set crossHarness to false for malformed edges, even across harnesses", () => {
            const source = buildRecord({
                path: "a.md",
                harness: "claude",
                edges: [
                    buildEdge({
                        direction: { from: "a.md", to: "b.md" },
                        malformed: true,
                        reason: "missing-target",
                    }),
                ],
            });
            const target = buildRecord({ path: "b.md", harness: "copilot" });
            const summary = buildSummary({ totalRecords: 2 });

            const report = toJson(summary, [], [source, target]);

            expect(report.edges[0].crossHarness).toBe(false);
            expect(report.edges[0].reason).toBe("missing-target");
        });

        it("should always set crossHarness to false for glob-binding edges", () => {
            const source = buildRecord({
                path: "a.md",
                harness: "claude",
                edges: [
                    buildEdge({
                        type: "glob-binding",
                        direction: { from: "a.md", to: "**/*.ts" },
                        target: "**/*.ts",
                    }),
                ],
            });
            const summary = buildSummary({ totalRecords: 1 });

            const report = toJson(summary, [], [source]);

            expect(report.edges[0].crossHarness).toBe(false);
        });

        it("should emit one edge entry per resolved target when to is a list", () => {
            const source = buildRecord({
                path: "a.md",
                harness: "claude",
                edges: [
                    buildEdge({
                        direction: {
                            from: "a.md",
                            to: ["same.md", "other.md"],
                        },
                    }),
                ],
            });
            const sameHarnessTarget = buildRecord({
                path: "same.md",
                harness: "claude",
            });
            const crossHarnessTarget = buildRecord({
                path: "other.md",
                harness: "copilot",
            });
            const summary = buildSummary({ totalRecords: 3 });

            const report = toJson(
                summary,
                [],
                [source, sameHarnessTarget, crossHarnessTarget],
            );

            expect(report.edges).toHaveLength(2);
            expect(
                report.edges.find((e) => e.to === "same.md")?.crossHarness,
            ).toBe(false);
            expect(
                report.edges.find((e) => e.to === "other.md")?.crossHarness,
            ).toBe(true);
        });

        it("should compute crossHarnessEdges as the count of edges with crossHarness true", () => {
            const source = buildRecord({
                path: "a.md",
                harness: "claude",
                edges: [
                    buildEdge({ direction: { from: "a.md", to: "cross.md" } }),
                    buildEdge({ direction: { from: "a.md", to: "same.md" } }),
                ],
            });
            const crossTarget = buildRecord({
                path: "cross.md",
                harness: "copilot",
            });
            const sameTarget = buildRecord({
                path: "same.md",
                harness: "claude",
            });
            const summary = buildSummary({ totalRecords: 3 });

            const report = toJson(
                summary,
                [],
                [source, crossTarget, sameTarget],
            );

            expect(report.crossHarnessEdges).toBe(
                report.edges.filter((e) => e.crossHarness).length,
            );
            expect(report.crossHarnessEdges).toBe(1);
        });
    });

    describe("backward compatibility", () => {
        it("should retain existing top-level keys unchanged", () => {
            const summary = buildSummary({
                archetype: "intentional-hybrid",
                totalRecords: 1,
                harnessBreakdown: [{ harness: "claude", count: 1 }],
                crossHarnessEdges: 0,
            });
            const findings: Finding[] = [];

            const report = toJson(summary, findings, [buildRecord()]);

            expect(report.archetype).toBe(summary.archetype);
            expect(report.dominanceScore).toBe(summary.dominanceScore);
            expect(report.totalRecords).toBe(summary.totalRecords);
            expect(report.harnessBreakdown).toEqual(summary.harnessBreakdown);
            expect(report.crossHarnessEdges).toBe(summary.crossHarnessEdges);
            expect(report.findings).toEqual(findings);
        });
    });

    describe("intent load status", () => {
        it("should include the intent load report with status, checked path, reason, and issues", () => {
            // Arrange
            const intentLoad: IntentLoadReport = {
                status: "invalid-schema",
                checkedPath: `/${chance.word()}/.agentic-doctor/intent.json`,
                reason: chance.sentence(),
                issues: [{ path: chance.word(), message: chance.sentence() }],
            };

            // Act
            const report = toJson(
                buildSummary(),
                [],
                [],
                undefined,
                intentLoad,
            );

            // Assert
            expect(report.intent).toEqual(intentLoad);
        });

        it("should accept every status the intent entity defines", () => {
            for (const status of INTENT_LOAD_STATUSES) {
                const intentLoad: IntentLoadReport = {
                    status,
                    checkedPath: chance.word(),
                };

                const report = toJson(
                    buildSummary(),
                    [],
                    [],
                    undefined,
                    intentLoad,
                );

                expect(report.intent?.status).toBe(status);
            }
        });

        it("should carry the omitted issue count", () => {
            const intentLoad: IntentLoadReport = {
                status: "invalid-schema",
                checkedPath: chance.word(),
                issues: [{ path: chance.word(), message: chance.sentence() }],
                omittedIssueCount: chance.integer({ min: 1, max: 50 }),
            };

            const report = toJson(
                buildSummary(),
                [],
                [],
                undefined,
                intentLoad,
            );

            expect(report.intent?.omittedIssueCount).toBe(
                intentLoad.omittedIssueCount,
            );
        });

        it("should omit the intent field when no intent load was attempted", () => {
            const report = toJson(buildSummary(), [], []);

            expect(report).not.toHaveProperty("intent");
        });

        it("should reject an unknown intent status", () => {
            const intentLoad = {
                status: chance.word(),
                checkedPath: chance.word(),
            } as unknown as IntentLoadReport;

            expect(() =>
                toJson(buildSummary(), [], [], undefined, intentLoad),
            ).toThrow();
        });
    });

    describe("evaluation state", () => {
        it("should report a full evaluation as completed by default", () => {
            const report = toJson(buildSummary(), [], []);

            expect(report.evaluation).toBe("completed");
        });

        it("should pass a not-applicable evaluation state through", () => {
            const report = toJson(
                buildSummary(),
                [],
                [],
                undefined,
                undefined,
                "not-applicable",
            );

            expect(report.evaluation).toBe("not-applicable");
            expect(() => ReportJsonSchema.parse(report)).not.toThrow();
        });

        it("should reject an evaluation state outside the known set", () => {
            const unknownState = chance.word();

            expect(() =>
                toJson(
                    buildSummary(),
                    [],
                    [],
                    undefined,
                    undefined,
                    unknownState as unknown as "completed",
                ),
            ).toThrow();
        });
    });

    describe("schema validation", () => {
        it("should produce output that satisfies the ReportJson schema", () => {
            const record = buildRecord({
                edges: [buildEdge({ direction: { from: "a.md", to: "b.md" } })],
            });
            const summary = buildSummary({ totalRecords: 1 });

            const report = toJson(summary, [], [record]);

            expect(() => ReportJsonSchema.parse(report)).not.toThrow();
        });

        it("should throw when a record has a harness outside the known set", () => {
            const invalidRecord = {
                id: "x:a.md",
                path: "a.md",
                harness: "not-a-real-harness",
                constructType: "instruction",
                loadMechanism: "convention-loaded",
                edges: [],
            } as unknown as InventoryRecord;
            const summary = buildSummary({ totalRecords: 1 });

            expect(() => toJson(summary, [], [invalidRecord])).toThrow();
        });
    });
});

describe("toSummaryJson", () => {
    const archetypeSummary = buildSummary({
        archetype: "intentional-hybrid",
        dominanceScore: chance.floating({ min: 0.1, max: 0.9 }),
        totalRecords: chance.integer({ min: 2, max: 50 }),
        harnessBreakdown: [
            { harness: "claude", count: chance.integer({ min: 1, max: 20 }) },
            { harness: "copilot", count: chance.integer({ min: 1, max: 20 }) },
        ],
        crossHarnessEdges: chance.integer({ min: 1, max: 50 }),
    });

    it("should carry every archetype field from the summary", () => {
        const report = toSummaryJson(archetypeSummary, []);

        expect(report).toMatchObject({
            archetype: archetypeSummary.archetype,
            dominanceScore: archetypeSummary.dominanceScore,
            totalRecords: archetypeSummary.totalRecords,
            harnessBreakdown: archetypeSummary.harnessBreakdown,
            crossHarnessEdges: archetypeSummary.crossHarnessEdges,
        });
    });

    it("should mark evaluation as skipped and list the inventory without edges or findings", () => {
        const record = buildRecord();

        const report = toSummaryJson(archetypeSummary, [record]);

        expect(report.evaluation).toBe("skipped");
        expect(report.inventory).toEqual([
            expect.objectContaining({ id: record.id, path: record.path }),
        ]);
        expect(report).not.toHaveProperty("edges");
        expect(report).not.toHaveProperty("findings");
    });
});
