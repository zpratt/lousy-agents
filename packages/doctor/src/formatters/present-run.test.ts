import Chance from "chance";
import { createConsola } from "consola";
import { describe, expect, it } from "vitest";
import type { ArchetypeClassification } from "../entities/archetype.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import type { Finding } from "../entities/finding.js";
import type { DoctorRun } from "../use-cases/run-doctor.js";
import { presentDoctorRun } from "./present-run.js";

const chance = new Chance();

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
    let stdout = "";
    const logger = createConsola({
        level: 3,
        reporters: [{ log: (entry) => humanLines.push(entry.args.join(" ")) }],
    });
    const exitCode = presentDoctorRun(run, format, {
        logger,
        writeStdout: (text) => {
            stdout += text;
        },
    });
    return { exitCode, text: humanLines.join("\n"), stdout };
}

describe("presentDoctorRun", () => {
    describe("when the run is a summary", () => {
        const run: DoctorRun = {
            kind: "summary",
            classification: pureClassification,
            records: [record],
        };

        it("should say evaluation was skipped instead of claiming no findings", () => {
            const { text, exitCode } = present(run, "human");

            expect(text).toContain("Evaluation skipped (--summary)");
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

    describe("when no agentic constructs exist", () => {
        const run: DoctorRun = {
            kind: "no-constructs",
            classification: {
                archetype: "none",
                dominanceScore: 0,
                ambiguities: [],
            },
            records: [],
        };

        it("should say so in human output", () => {
            const { text, exitCode } = present(run, "human");

            expect(text).toContain("No agentic constructs found");
            expect(exitCode).toBe(0);
        });

        it("should emit a completed JSON report with empty arrays", () => {
            const report = JSON.parse(present(run, "json").stdout);

            expect(report.evaluation).toBe("completed");
            expect(report.findings).toEqual([]);
            expect(report.inventory).toEqual([]);
        });
    });
});
