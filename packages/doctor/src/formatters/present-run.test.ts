import Chance from "chance";
import { createConsola } from "consola";
import { describe, expect, it } from "vitest";
import type { ArchetypeClassification } from "../entities/archetype.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import type { Finding } from "../entities/finding.js";
import type { DoctorRun } from "../use-cases/run-doctor.js";
import { presentDoctorRun } from "./present-run.js";

const chance = new Chance();

const SUMMARY_SKIPPED_SENTENCE =
    "Evaluation skipped (--summary). Run without --summary to check criteria.";

const pureClassification: ArchetypeClassification = {
    archetype: "pure",
    dominanceScore: 1,
    ambiguities: [],
};

const record: InventoryRecord = {
    id: "claude:CLAUDE.md",
    path: "CLAUDE.md",
    harness: "claude",
    constructType: "instruction",
    loadMechanism: "convention-loaded",
    edges: [],
};

function buildFinding(overrides: Partial<Finding> = {}): Finding {
    return {
        id: `${chance.word()}:all`,
        criterionId: chance.word(),
        targetId: "all",
        severity: "medium",
        category: "governance",
        classification: "defect",
        intentGated: false,
        assumedIntent: false,
        description: chance.sentence(),
        ...overrides,
    };
}

function present(run: DoctorRun, format: "human" | "json") {
    const humanLines: string[] = [];
    const warned: string[] = [];
    let stdout = "";
    const logger = createConsola({
        level: 3,
        reporters: [
            {
                log: (entry) => {
                    const line = entry.args.join(" ");
                    humanLines.push(line);
                    if (entry.type === "warn") {
                        warned.push(line);
                    }
                },
            },
        ],
    });
    const exitCode = presentDoctorRun(run, format, {
        logger,
        writeStdout: (text) => {
            stdout += text;
        },
    });
    return { exitCode, text: humanLines.join("\n"), warned, stdout };
}

describe("presentDoctorRun", () => {
    describe("when the run is a summary", () => {
        const run: DoctorRun = {
            kind: "summary",
            classification: pureClassification,
            records: [record],
            scanWarnings: [],
        };

        it("should say evaluation was skipped instead of claiming no findings", () => {
            const { text, exitCode } = present(run, "human");

            expect(text).toContain(SUMMARY_SKIPPED_SENTENCE);
            expect(text).not.toContain("No findings");
            expect(exitCode).toBe(0);
        });

        it("should emit JSON with evaluation skipped and no findings or edges", () => {
            const { stdout, exitCode } = present(run, "json");

            const report = JSON.parse(stdout);
            expect(report.evaluation).toBe("skipped");
            expect(report).not.toHaveProperty("findings");
            expect(report).not.toHaveProperty("edges");
            expect(report.inventory).toHaveLength(1);
            expect(exitCode).toBe(0);
        });
    });

    describe("when the run evaluated findings", () => {
        it("should emit JSON with evaluation completed", () => {
            const run: DoctorRun = {
                kind: "evaluated",
                classification: pureClassification,
                records: [record],
                scanWarnings: [],
                findings: [],
                intentLoad: { status: "absent", checkedPath: chance.word() },
            };

            const { stdout } = present(run, "json");

            expect(JSON.parse(stdout).evaluation).toBe("completed");
        });

        it("should say no findings only when evaluation completed with none", () => {
            const run: DoctorRun = {
                kind: "evaluated",
                classification: pureClassification,
                records: [record],
                scanWarnings: [],
                findings: [],
                intentLoad: { status: "loaded", checkedPath: chance.word() },
            };

            const { text } = present(run, "human");

            expect(text).toContain("No findings.");
        });

        for (const format of ["human", "json"] as const) {
            it(`should exit 1 for a blocking defect in ${format} output`, () => {
                const run: DoctorRun = {
                    kind: "evaluated",
                    classification: pureClassification,
                    records: [record],
                    scanWarnings: [],
                    findings: [buildFinding({ severity: "high" })],
                    intentLoad: {
                        status: "loaded",
                        checkedPath: chance.word(),
                    },
                };

                expect(present(run, format).exitCode).toBe(1);
            });

            it(`should exit 0 for a non-blocking finding in ${format} output`, () => {
                const run: DoctorRun = {
                    kind: "evaluated",
                    classification: pureClassification,
                    records: [record],
                    scanWarnings: [],
                    findings: [
                        buildFinding({
                            severity: "high",
                            classification: "advisory",
                        }),
                    ],
                    intentLoad: {
                        status: "loaded",
                        checkedPath: chance.word(),
                    },
                };

                expect(present(run, format).exitCode).toBe(0);
            });
        }
    });

    describe("when the scan stopped at its directory limit", () => {
        const ScanWarningText = `Stopped after ${chance.integer({ min: 1, max: 99_999 })} directories.`;
        const scanWarning = buildFinding({
            criterionId: "discovery-limit-reached",
            targetId: "all:repository",
            classification: "advisory",
            description: ScanWarningText,
        });
        const intentLoad = { status: "loaded", checkedPath: chance.word() };
        const noConstructs = {
            archetype: "none",
            dominanceScore: 0,
            ambiguities: [],
        } as const;

        const summaryRun: DoctorRun = {
            kind: "summary",
            classification: pureClassification,
            records: [record],
            scanWarnings: [scanWarning],
        };
        const noConstructsRun: DoctorRun = {
            kind: "no-constructs",
            classification: noConstructs,
            records: [],
            scanWarnings: [scanWarning],
        };
        const cleanRun: DoctorRun = {
            kind: "evaluated",
            classification: pureClassification,
            records: [record],
            scanWarnings: [scanWarning],
            findings: [],
            intentLoad,
        };
        const blockingDefect = buildFinding({
            severity: "critical",
            classification: "defect",
        });
        const blockedRun: DoctorRun = {
            kind: "evaluated",
            classification: pureClassification,
            records: [record],
            scanWarnings: [scanWarning],
            findings: [blockingDefect],
            intentLoad,
        };

        describe("in human output", () => {
            it("should warn after the summary and still exit 0", () => {
                const { warned, text, exitCode } = present(summaryRun, "human");

                expect(warned).toEqual([ScanWarningText]);
                expect(text).toContain(SUMMARY_SKIPPED_SENTENCE);
                expect(exitCode).toBe(0);
            });

            it("should warn when no agentic constructs exist and still exit 0", () => {
                const { warned, text, exitCode } = present(
                    noConstructsRun,
                    "human",
                );

                expect(text).toContain("No agentic constructs found");
                expect(warned).toEqual([ScanWarningText]);
                expect(exitCode).toBe(0);
            });

            it("should list the warning among the findings instead of claiming a clean run", () => {
                const { text, exitCode } = present(cleanRun, "human");

                expect(text).toContain(ScanWarningText);
                expect(text).not.toContain("No findings.");
                expect(exitCode).toBe(0);
            });

            it("should list the warning next to a blocking defect and exit 1", () => {
                const { text, exitCode } = present(blockedRun, "human");

                expect(text).toContain(ScanWarningText);
                expect(text).toContain(blockingDefect.description);
                expect(exitCode).toBe(1);
            });
        });

        describe("in JSON output", () => {
            it("should keep the summary document free of the warning and warn through the logger", () => {
                const { stdout, warned, exitCode } = present(
                    summaryRun,
                    "json",
                );

                const report = JSON.parse(stdout);
                expect(report.evaluation).toBe("skipped");
                expect(report).not.toHaveProperty("findings");
                expect(stdout).not.toContain(ScanWarningText);
                expect(warned).toEqual([ScanWarningText]);
                expect(exitCode).toBe(0);
            });

            it("should report the warning as the only finding when no agentic constructs exist", () => {
                const { stdout, warned, exitCode } = present(
                    noConstructsRun,
                    "json",
                );

                const report = JSON.parse(stdout);
                expect(report.evaluation).toBe("not-applicable");
                expect(report.findings).toEqual([
                    expect.objectContaining({ id: scanWarning.id }),
                ]);
                expect(warned).toEqual([]);
                expect(exitCode).toBe(0);
            });

            it("should report the warning as the only finding of a completed evaluation", () => {
                const { stdout, warned, exitCode } = present(cleanRun, "json");

                const report = JSON.parse(stdout);
                expect(report.evaluation).toBe("completed");
                expect(report.findings).toEqual([
                    expect.objectContaining({
                        id: scanWarning.id,
                        criterionId: "discovery-limit-reached",
                        targetId: "all:repository",
                        classification: "advisory",
                    }),
                ]);
                expect(warned).toEqual([]);
                expect(exitCode).toBe(0);
            });

            it("should list the warning after the criteria findings and exit 1 for a blocking defect", () => {
                const { stdout, exitCode } = present(blockedRun, "json");

                const report = JSON.parse(stdout);
                expect(
                    report.findings.map((finding: Finding) => finding.id),
                ).toEqual([blockingDefect.id, scanWarning.id]);
                expect(exitCode).toBe(1);
            });
        });

        describe("when a warning would block if it were a criteria finding", () => {
            const harshWarning = buildFinding({
                severity: "critical",
                classification: "defect",
            });
            const harshRun: DoctorRun = {
                kind: "evaluated",
                classification: pureClassification,
                records: [record],
                scanWarnings: [harshWarning],
                findings: [],
                intentLoad,
            };

            it.each(["human", "json"] as const)(
                "should still exit 0 in %s output, because scan warnings never block",
                (format) => {
                    expect(present(harshRun, format).exitCode).toBe(0);
                },
            );
        });
    });

    describe("when an evidence snapshot reference is available", () => {
        const snapshotRef = chance.hash();
        const evaluatedRun: DoctorRun = {
            kind: "evaluated",
            classification: pureClassification,
            records: [record],
            scanWarnings: [],
            findings: [],
            intentLoad: { status: "absent", checkedPath: chance.word() },
            snapshotRef,
        };
        const summaryRun: DoctorRun = {
            kind: "summary",
            classification: pureClassification,
            records: [record],
            scanWarnings: [],
            snapshotRef,
        };
        const noConstructsRun: DoctorRun = {
            kind: "no-constructs",
            classification: {
                archetype: "none",
                dominanceScore: 0,
                ambiguities: [],
            },
            records: [],
            scanWarnings: [],
            snapshotRef,
        };

        it("should include it in the JSON report of an evaluated run", () => {
            const { stdout } = present(evaluatedRun, "json");

            expect(JSON.parse(stdout).snapshotRef).toBe(snapshotRef);
        });

        it("should end the JSON document with a closing brace and one newline", () => {
            const { stdout } = present(evaluatedRun, "json");

            expect(stdout.endsWith("}\n")).toBe(true);
            expect(stdout.endsWith("}\n\n")).toBe(false);
        });

        it("should include it in the JSON report when no constructs exist", () => {
            const { stdout } = present(noConstructsRun, "json");

            expect(JSON.parse(stdout).snapshotRef).toBe(snapshotRef);
        });

        it("should print it in the human report of an evaluated run", () => {
            const { text } = present(evaluatedRun, "human");

            expect(text).toContain(`Evidence snapshot: ${snapshotRef}`);
        });

        it("should print it in the human summary", () => {
            const { text } = present(summaryRun, "human");

            expect(text).toContain(`Evidence snapshot: ${snapshotRef}`);
        });
    });

    describe("when no evidence snapshot reference is available", () => {
        const run: DoctorRun = {
            kind: "evaluated",
            classification: pureClassification,
            records: [record],
            scanWarnings: [],
            findings: [],
            intentLoad: { status: "absent", checkedPath: chance.word() },
        };

        it("should omit it from the JSON report", () => {
            const { stdout } = present(run, "json");

            expect(JSON.parse(stdout)).not.toHaveProperty("snapshotRef");
        });

        it("should not print an evidence snapshot line", () => {
            const { text } = present(run, "human");

            expect(text).not.toContain("Evidence snapshot:");
        });
    });

    describe("when no agentic constructs exist", () => {
        const run: DoctorRun = {
            kind: "no-constructs",
            classification: {
                archetype: "none",
                dominanceScore: 0,
                ambiguities: [],
            },
            records: [],
            scanWarnings: [],
        };

        it("should say so in human output", () => {
            const { text, exitCode } = present(run, "human");

            expect(text).toContain("No agentic constructs found");
            expect(exitCode).toBe(0);
        });

        it("should emit a not-applicable JSON report with empty arrays", () => {
            const report = JSON.parse(present(run, "json").stdout);

            expect(report.evaluation).toBe("not-applicable");
            expect(report.findings).toEqual([]);
            expect(report.inventory).toEqual([]);
        });
    });
});
