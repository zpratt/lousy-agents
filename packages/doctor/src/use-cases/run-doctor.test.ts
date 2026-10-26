import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { DeclaredIntentArtifact } from "../entities/declared-intent.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import type { IntentLoadReport } from "../entities/intent-load.js";
import type { DoctorRunPorts, LoadedIntent } from "./run-doctor.js";
import { runDoctor } from "./run-doctor.js";

const chance = new Chance();

function buildRecord(
    overrides: Partial<InventoryRecord> = {},
): InventoryRecord {
    return {
        id: "claude:CLAUDE.md",
        path: "CLAUDE.md",
        harness: "claude",
        constructType: "instruction",
        loadMechanism: "convention-loaded",
        edges: [],
        ...overrides,
    };
}

function sprawlRecords(): InventoryRecord[] {
    return [
        buildRecord(),
        buildRecord({
            id: "copilot:.github/copilot-instructions.md",
            path: ".github/copilot-instructions.md",
            harness: "copilot",
        }),
    ];
}

function intentResult(status: IntentLoadReport["status"]): LoadedIntent {
    return {
        intent: null,
        report: { status, checkedPath: `/${chance.word()}/intent.json` },
    };
}

function buildPorts(overrides: Partial<DoctorRunPorts> = {}): DoctorRunPorts {
    return {
        scanRepository: vi.fn().mockResolvedValue([buildRecord()]),
        readIntent: vi.fn().mockResolvedValue(intentResult("absent")),
        loadSnapshotRef: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe("runDoctor", () => {
    const repoPath = `/${chance.word()}`;

    describe("when only a summary is requested", () => {
        it("should return a summary without reading intent or evaluating", async () => {
            const ports = buildPorts();

            const run = await runDoctor({ repoPath, summaryOnly: true }, ports);

            expect(run.kind).toBe("summary");
            expect(run).not.toHaveProperty("findings");
            expect(ports.readIntent).not.toHaveBeenCalled();
        });
    });

    describe("when no agentic constructs exist", () => {
        it("should return no-constructs without reading intent", async () => {
            const ports = buildPorts({
                scanRepository: vi.fn().mockResolvedValue([]),
            });

            const run = await runDoctor(
                { repoPath, summaryOnly: false },
                ports,
            );

            expect(run.kind).toBe("no-constructs");
            expect(ports.readIntent).not.toHaveBeenCalled();
        });
    });

    describe("when constructs exist", () => {
        it("should evaluate findings and carry the intent load report", async () => {
            const loaded = intentResult("invalid-json");
            const ports = buildPorts({
                readIntent: vi.fn().mockResolvedValue(loaded),
            });

            const run = await runDoctor(
                { repoPath, summaryOnly: false },
                ports,
            );

            expect(run.kind).toBe("evaluated");
            if (run.kind === "evaluated") {
                expect(run.intentLoad).toEqual(loaded.report);
                expect(run.findings.map((f) => f.criterionId)).toContain(
                    "invalid-intent-artifact",
                );
            }
        });

        it("should pass the snapshot reference through", async () => {
            const snapshotRef = chance.hash();
            const ports = buildPorts({
                loadSnapshotRef: vi.fn().mockResolvedValue(snapshotRef),
            });

            const run = await runDoctor(
                { repoPath, summaryOnly: false },
                ports,
            );

            expect(run.snapshotRef).toBe(snapshotRef);
        });
    });

    describe("when an intent elicitor is provided", () => {
        describe("when intent is absent and the repository is ambiguous", () => {
            const artifact: DeclaredIntentArtifact = {
                targetHarnesses: ["claude", "copilot"],
                desiredCapabilities: [],
                confirmedAnswers: {},
                intentSource: "pre-committed",
            };

            function buildAmbiguousPorts(elicitIntent = vi.fn()) {
                const readIntent = vi
                    .fn()
                    .mockResolvedValueOnce(intentResult("absent"))
                    .mockResolvedValueOnce({
                        intent: artifact,
                        report: {
                            status: "loaded",
                            checkedPath: chance.word(),
                        },
                    });
                return {
                    readIntent,
                    elicitIntent,
                    ports: buildPorts({
                        scanRepository: vi
                            .fn()
                            .mockResolvedValue(sprawlRecords()),
                        readIntent,
                        elicitIntent,
                    }),
                };
            }

            it("should ask the ambiguity questions", async () => {
                const { elicitIntent, ports } = buildAmbiguousPorts();

                await runDoctor({ repoPath, summaryOnly: false }, ports);

                expect(elicitIntent).toHaveBeenCalledWith([
                    expect.objectContaining({ id: "intended-multi-harness" }),
                ]);
            });

            it("should evaluate an intent file created while the user was answering", async () => {
                const { readIntent, ports } = buildAmbiguousPorts();

                const run = await runDoctor(
                    { repoPath, summaryOnly: false },
                    ports,
                );

                expect(readIntent).toHaveBeenCalledTimes(2);
                expect(run).toMatchObject({
                    kind: "evaluated",
                    intentLoad: { status: "loaded" },
                });
            });
        });

        it("should not ask questions when the intent file was rejected", async () => {
            const elicitIntent = vi.fn();
            const ports = buildPorts({
                scanRepository: vi.fn().mockResolvedValue(sprawlRecords()),
                readIntent: vi
                    .fn()
                    .mockResolvedValue(intentResult("invalid-schema")),
                elicitIntent,
            });

            await runDoctor({ repoPath, summaryOnly: false }, ports);

            expect(elicitIntent).not.toHaveBeenCalled();
        });

        it("should not ask anything when there are no ambiguity questions", async () => {
            const elicitIntent = vi.fn();
            const ports = buildPorts({ elicitIntent });

            await runDoctor({ repoPath, summaryOnly: false }, ports);

            expect(elicitIntent).not.toHaveBeenCalled();
        });
    });
});
