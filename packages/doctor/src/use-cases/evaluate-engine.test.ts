import { describe, expect, it } from "vitest";
import type { ArchetypeClassification } from "../entities/archetype.js";
import type { Edge, InventoryRecord } from "../entities/edge-types.js";
import { hasBlockingFindings } from "../formatters/human-renderer.js";
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

        it("should produce a finding when the intent load status is absent", () => {
            const findings = evaluate(CRITERIA, {
                records: [makeRecord({ harness: "claude", path: "CLAUDE.md" })],
                classification: makeClassification("pure"),
                intent: null,
                intentLoadStatus: "absent",
            });

            const criterionIds = findings.map((f) => f.criterionId);
            expect(criterionIds).toContain("missing-intent-artifact");
            expect(criterionIds).not.toContain("invalid-intent-artifact");
        });
    });

    describe("when intent and load status disagree", () => {
        it("should report missing intent when the artifact is null even if the status claims loaded", () => {
            const findings = evaluate(CRITERIA, {
                records: [makeRecord({ harness: "claude", path: "CLAUDE.md" })],
                classification: makeClassification("pure"),
                intent: null,
                intentLoadStatus: "loaded",
            });

            expect(findings.map((f) => f.criterionId)).toContain(
                "missing-intent-artifact",
            );
        });
    });

    describe("invalid-intent-artifact criterion (intent.artifactRejected)", () => {
        const rejectedStatuses = [
            "invalid-json",
            "invalid-schema",
            "symlink-rejected",
            "read-failed",
        ] as const;

        for (const intentLoadStatus of rejectedStatuses) {
            it(`should report a rejected file instead of a missing one when status is ${intentLoadStatus}`, () => {
                // Arrange
                const records = [
                    makeRecord({ harness: "claude", path: "CLAUDE.md" }),
                ];

                // Act
                const findings = evaluate(CRITERIA, {
                    records,
                    classification: makeClassification("pure"),
                    intent: null,
                    intentLoadStatus,
                });

                // Assert
                const invalid = findings.find(
                    (f) => f.criterionId === "invalid-intent-artifact",
                );
                expect(invalid).toMatchObject({
                    id: "invalid-intent-artifact:all:intent",
                    targetId: "all:intent",
                    severity: "medium",
                    assumedIntent: true,
                });
                expect(
                    findings.some(
                        (f) => f.criterionId === "missing-intent-artifact",
                    ),
                ).toBe(false);
            });
        }

        it("should not produce a finding when the intent file loaded", () => {
            const findings = evaluate(CRITERIA, {
                records: [makeRecord({ harness: "claude", path: "CLAUDE.md" })],
                classification: makeClassification("pure"),
                intent: {
                    targetHarnesses: ["claude"],
                    desiredCapabilities: [],
                    confirmedAnswers: {},
                    intentSource: "pre-committed",
                },
                intentLoadStatus: "loaded",
            });

            const intentFindings = findings.filter(
                (f) => f.targetId === "all:intent",
            );
            expect(intentFindings).toEqual([]);
        });

        it("should not produce a finding when there are no records", () => {
            const findings = evaluate(CRITERIA, {
                records: [],
                classification: makeClassification("none"),
                intent: null,
                intentLoadStatus: "invalid-json",
            });

            expect(
                findings.some(
                    (f) => f.criterionId === "invalid-intent-artifact",
                ),
            ).toBe(false);
        });
    });

    describe("malformed-claude-import criterion (inventory.edgePresent)", () => {
        it("should produce a high finding when claude records have malformed hard-import edges", () => {
            const missingTarget = "docs/missing.md";
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
                                to: missingTarget,
                            },
                            target: missingTarget,
                            malformed: true,
                            reason: "missing-target",
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

        it.each(["home", "absolute", "path-traversal"] as const)(
            "should not produce a blocking finding for an import that is outside the repository (%s)",
            (reason) => {
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
                                reason,
                            },
                        ],
                    }),
                ];

                const findings = evaluate(CRITERIA, {
                    records,
                    classification: makeClassification("pure"),
                    intent: null,
                });

                expect(
                    findings.find(
                        (f) => f.criterionId === "malformed-claude-import",
                    ),
                ).toBeUndefined();
            },
        );

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
        it("should produce a finding mentioning @path hard-imports when a copilot file has a hard-import edge to a claude file", () => {
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
            expect(finding?.description).toMatch(/@path/);
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
        it("should produce a finding describing a markdown hyperlink, not @path hard-imports, when a copilot file links to a claude file", () => {
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
            expect(finding?.description).not.toMatch(/@path/);
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

describe("external-claude-import criterion (inventory.externalImport)", () => {
    function claudeRecordWith(...edges: Edge[]): InventoryRecord {
        return makeRecord({
            harness: "claude",
            path: "CLAUDE.md",
            id: "claude:CLAUDE.md",
            edges,
        });
    }

    function importEdge(
        target: string,
        reason: Edge["reason"],
        type: Edge["type"] = "hard-import",
    ): Edge {
        return {
            type,
            direction: { from: "CLAUDE.md", to: target },
            target,
            malformed: true,
            reason,
        };
    }

    function externalFindings(records: InventoryRecord[]) {
        return evaluate(CRITERIA, {
            records,
            classification: makeClassification("pure"),
            intent: null,
        }).filter((f) => f.criterionId === "external-claude-import");
    }

    it.each([
        ["~/shared.md", "home", "docs-based and was not observed"],
        [
            "/opt/shared.md",
            "absolute",
            "not loaded in testing (Claude Code 2.1.316)",
        ],
        [
            "../shared.md",
            "path-traversal",
            "not loaded in testing (Claude Code 2.1.316)",
        ],
    ] as const)(
        "should produce one medium advisory finding that names %s and says only what was observed",
        (target, reason, observation) => {
            const findings = externalFindings([
                claudeRecordWith(importEdge(target, reason)),
            ]);

            expect(findings).toHaveLength(1);
            expect(findings[0]).toMatchObject({
                severity: "medium",
                classification: "advisory",
                category: "malformed-reference",
                intentGated: false,
                assumedIntent: false,
            });
            expect(findings[0].description).toContain(
                `External import: \`${target}\``,
            );
            expect(findings[0].description).toContain(observation);
        },
    );

    it("should produce a separate finding for each external import", () => {
        const findings = externalFindings([
            claudeRecordWith(
                importEdge("~/a.md", "home"),
                importEdge("/opt/b.md", "absolute"),
            ),
        ]);

        expect(findings.map((f) => f.id)).toEqual([
            "external-claude-import:claude:CLAUDE.md:~/a.md",
            "external-claude-import:claude:CLAUDE.md:/opt/b.md",
        ]);
    });

    it("should not report a missing in-repository target as external", () => {
        const findings = externalFindings([
            claudeRecordWith(importEdge("docs/missing.md", "missing-target")),
        ]);

        expect(findings).toEqual([]);
    });

    it("should only consider hard-imports, not soft references", () => {
        const findings = externalFindings([
            claudeRecordWith(
                importEdge("../shared.md", "path-traversal", "soft-reference"),
            ),
        ]);

        expect(findings).toEqual([]);
    });

    it("should never block CI", () => {
        const findings = externalFindings([
            claudeRecordWith(importEdge("~/a.md", "home")),
        ]);

        expect(hasBlockingFindings(findings)).toBe(false);
    });
});
