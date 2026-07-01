import { describe, expect, it } from "vitest";
import type { ArchetypeClassification } from "../entities/archetype.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import { CRITERIA } from "./criteria.js";
import { evaluate } from "./evaluate-engine.js";

function makeRecord(
    overrides: Partial<InventoryRecord> & {
        harness: InventoryRecord["harness"];
    },
): InventoryRecord {
    return {
        id: `${overrides.harness}:test.md`,
        path: "test.md",
        constructType: "instruction",
        loadMechanism: "convention-loaded",
        edges: [],
        ...overrides,
    };
}

function makeClassification(
    archetype: ArchetypeClassification["archetype"],
): ArchetypeClassification {
    return { archetype, dominanceScore: 1, ambiguities: [] };
}

describe("evaluate", () => {
    describe("missing-copilot-instructions criterion", () => {
        it("should produce a critical finding when copilot records exist but not copilot-instructions.md", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "copilot",
                    path: ".github/instructions/services.instructions.md",
                    id: "copilot:.github/instructions/services.instructions.md",
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("pure"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "missing-copilot-instructions",
            );
            expect(finding).toBeDefined();
            expect(finding?.severity).toBe("critical");
        });

        it("should not produce a finding when copilot-instructions.md is present", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "copilot",
                    path: ".github/copilot-instructions.md",
                    id: "copilot:.github/copilot-instructions.md",
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("pure"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "missing-copilot-instructions",
            );
            expect(finding).toBeUndefined();
        });
    });

    describe("missing-intent-artifact criterion", () => {
        it("should produce a medium finding when records exist but intent is null", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("pure"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "missing-intent-artifact",
            );
            expect(finding).toBeDefined();
            expect(finding?.severity).toBe("medium");
        });

        it("should not produce a finding when intent artifact is present", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("pure"),
                intent: {
                    targetHarnesses: ["claude"],
                    desiredCapabilities: [],
                    confirmedAnswers: {},
                    intentSource: "pre-committed",
                },
            });

            const finding = findings.find(
                (f) => f.criterionId === "missing-intent-artifact",
            );
            expect(finding).toBeUndefined();
        });

        it("should not produce a finding when there are no records", () => {
            const findings = evaluate(CRITERIA, {
                records: [],
                classification: makeClassification("none"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "missing-intent-artifact",
            );
            expect(finding).toBeUndefined();
        });
    });

    describe("malformed-claude-import criterion (inventory.edgePresent)", () => {
        it("should produce a high finding when claude records have malformed hard-import edges", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                    edges: [
                        {
                            type: "hard-import",
                            direction: {
                                from: "CLAUDE.md",
                                to: "../outside.md",
                            },
                            target: "../outside.md",
                            malformed: true,
                            reason: "path-traversal",
                        },
                    ],
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("pure"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "malformed-claude-import",
            );
            expect(finding).toBeDefined();
            expect(finding?.severity).toBe("high");
            expect(finding?.targetId).toBe("claude:malformed");
        });

        it("should not produce a finding when copilot (not claude) records have malformed edges", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "copilot",
                    path: ".github/copilot-instructions.md",
                    id: "copilot:.github/copilot-instructions.md",
                    edges: [
                        {
                            type: "soft-reference",
                            direction: {
                                from: ".github/copilot-instructions.md",
                                to: "../outside.md",
                            },
                            target: "../outside.md",
                            malformed: true,
                            reason: "path-traversal",
                        },
                    ],
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("pure"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "malformed-claude-import",
            );
            expect(finding).toBeUndefined();
        });

        it("should not produce a finding when claude records have no malformed edges", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                    edges: [],
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("pure"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "malformed-claude-import",
            );
            expect(finding).toBeUndefined();
        });
    });

    describe("cross-harness-drift criterion (inventory.archetypeIs)", () => {
        it("should produce a finding for any accidental-sprawl archetype", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                    edges: [],
                }),
                makeRecord({
                    harness: "copilot",
                    path: ".github/copilot-instructions.md",
                    id: "copilot:.github/copilot-instructions.md",
                    edges: [],
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("accidental-sprawl"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "cross-harness-drift",
            );
            expect(finding).toBeDefined();
            expect(finding?.severity).toBe("high");
            expect(finding?.targetId).toBe("all:accidental-sprawl");
        });

        it("should produce a finding even when cross-harness edges exist, given archetype is accidental-sprawl", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                    edges: [
                        {
                            type: "soft-reference",
                            direction: {
                                from: "CLAUDE.md",
                                to: ".github/copilot-instructions.md",
                            },
                            target: ".github/copilot-instructions.md",
                            malformed: false,
                        },
                    ],
                }),
                makeRecord({
                    harness: "copilot",
                    path: ".github/copilot-instructions.md",
                    id: "copilot:.github/copilot-instructions.md",
                    edges: [],
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("accidental-sprawl"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "cross-harness-drift",
            );
            expect(finding).toBeDefined();
        });

        it("should not produce a cross-harness-drift finding for non-accidental-sprawl archetypes", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                    edges: [],
                }),
                makeRecord({
                    harness: "copilot",
                    path: ".github/copilot-instructions.md",
                    id: "copilot:.github/copilot-instructions.md",
                    edges: [],
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("intentional-hybrid"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "cross-harness-drift",
            );
            expect(finding).toBeUndefined();
        });
    });

    describe("wrong-direction-copilot-imports-claude criterion (hard-import edges only)", () => {
        it("should produce a finding mentioning @import directives when a copilot file has a hard-import edge to a claude file", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "copilot",
                    path: ".github/copilot-instructions.md",
                    id: "copilot:.github/copilot-instructions.md",
                    edges: [
                        {
                            type: "hard-import",
                            direction: {
                                from: ".github/copilot-instructions.md",
                                to: "CLAUDE.md",
                            },
                            target: "CLAUDE.md",
                            malformed: false,
                        },
                    ],
                }),
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("accidental-sprawl"),
                intent: null,
            });

            const finding = findings.find(
                (f) =>
                    f.criterionId === "wrong-direction-copilot-imports-claude",
            );
            expect(finding).toBeDefined();
            expect(finding?.description).toMatch(/@import/);
        });

        it("should not produce a wrong-direction-copilot-imports-claude finding when the only copilot->claude edge is a markdown hyperlink (soft-reference)", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "copilot",
                    path: ".github/copilot-instructions.md",
                    id: "copilot:.github/copilot-instructions.md",
                    edges: [
                        {
                            type: "soft-reference",
                            direction: {
                                from: ".github/copilot-instructions.md",
                                to: "CLAUDE.md",
                            },
                            target: "CLAUDE.md",
                            malformed: false,
                        },
                    ],
                }),
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("accidental-sprawl"),
                intent: null,
            });

            const finding = findings.find(
                (f) =>
                    f.criterionId === "wrong-direction-copilot-imports-claude",
            );
            expect(finding).toBeUndefined();
        });
    });

    describe("wrong-direction-copilot-links-claude criterion (markdown hyperlink / soft-reference edges)", () => {
        it("should produce a finding describing a markdown hyperlink, not @import directives, when a copilot file links to a claude file", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "copilot",
                    path: ".github/copilot-instructions.md",
                    id: "copilot:.github/copilot-instructions.md",
                    edges: [
                        {
                            type: "soft-reference",
                            direction: {
                                from: ".github/copilot-instructions.md",
                                to: "CLAUDE.md",
                            },
                            target: "CLAUDE.md",
                            malformed: false,
                        },
                    ],
                }),
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("accidental-sprawl"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "wrong-direction-copilot-links-claude",
            );
            expect(finding).toBeDefined();
            expect(finding?.description).not.toMatch(/@import/);
            expect(finding?.description.toLowerCase()).toMatch(
                /markdown hyperlink/,
            );
        });

        it("should not produce a wrong-direction-copilot-links-claude finding when copilot has no reference to a claude file", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "copilot",
                    path: ".github/copilot-instructions.md",
                    id: "copilot:.github/copilot-instructions.md",
                    edges: [],
                }),
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("accidental-sprawl"),
                intent: null,
            });

            const finding = findings.find(
                (f) => f.criterionId === "wrong-direction-copilot-links-claude",
            );
            expect(finding).toBeUndefined();
        });
    });

    describe("finding id format", () => {
        it("should produce ids in ${criterionId}:${targetId} format", () => {
            const records: InventoryRecord[] = [
                makeRecord({
                    harness: "claude",
                    path: "CLAUDE.md",
                    id: "claude:CLAUDE.md",
                }),
            ];
            const findings = evaluate(CRITERIA, {
                records,
                classification: makeClassification("pure"),
                intent: null,
            });

            for (const finding of findings) {
                expect(finding.id).toContain(":");
                expect(finding.id.startsWith(finding.criterionId)).toBe(true);
            }
        });
    });
});
