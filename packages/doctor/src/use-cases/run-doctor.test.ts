import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { DeclaredIntentArtifact } from "../entities/declared-intent.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import type { IntentLoadReport } from "../entities/intent-load.js";
import type {
    DiscoveryDepthLimit,
    DiscoveryDirectoryLimit,
    DiscoveryEntryLimit,
} from "./discovery-limit-finding.js";
import type {
    DoctorRunPorts,
    LoadedIntent,
    RepositoryScan,
} from "./run-doctor.js";
import { DoctorRunFailure, runDoctor } from "./run-doctor.js";

const chance = new Chance();

const MAX_DIRECTORIES = chance.integer({ min: 1, max: 99_999 });
const DIRECTORY_LIMIT = { maxDirectories: MAX_DIRECTORIES };
const limitWarning = expect.objectContaining({
    criterionId: "discovery-limit-reached",
    targetId: "all:repository",
    classification: "advisory",
    description: expect.stringContaining(`${MAX_DIRECTORIES}`),
});

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

function scanOf(
    records: InventoryRecord[],
    directoryLimit?: DiscoveryDirectoryLimit,
    depthLimit?: DiscoveryDepthLimit,
    entryLimit?: DiscoveryEntryLimit,
): RepositoryScan {
    return {
        records,
        ...(directoryLimit ? { directoryLimit } : {}),
        ...(depthLimit ? { depthLimit } : {}),
        ...(entryLimit ? { entryLimit } : {}),
    };
}

function intentResult(status: IntentLoadReport["status"]): LoadedIntent {
    return {
        intent: null,
        report: { status, checkedPath: `/${chance.word()}/intent.json` },
    };
}

function buildPorts(overrides: Partial<DoctorRunPorts> = {}): DoctorRunPorts {
    return {
        scanRepository: vi.fn().mockResolvedValue(scanOf([buildRecord()])),
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

    describe("when a summary is requested and no agentic constructs exist", () => {
        it("should return a summary, because --summary takes precedence", async () => {
            const ports = buildPorts({
                scanRepository: vi.fn().mockResolvedValue(scanOf([])),
            });

            const run = await runDoctor({ repoPath, summaryOnly: true }, ports);

            expect(run.kind).toBe("summary");
        });
    });

    describe("when no agentic constructs exist", () => {
        it("should return no-constructs without reading intent", async () => {
            const ports = buildPorts({
                scanRepository: vi.fn().mockResolvedValue(scanOf([])),
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

    describe("when the scan stopped at its directory limit", () => {
        const runShapes = [
            ["a summary", { summaryOnly: true, records: [buildRecord()] }],
            [
                "a run with no agentic constructs",
                { summaryOnly: false, records: [] },
            ],
            [
                "an evaluated run",
                { summaryOnly: false, records: [buildRecord()] },
            ],
        ] as const;

        it.each(runShapes)(
            "should carry exactly one discovery-limit warning on %s",
            async (_name, { summaryOnly, records }) => {
                const ports = buildPorts({
                    scanRepository: vi
                        .fn()
                        .mockResolvedValue(
                            scanOf([...records], DIRECTORY_LIMIT),
                        ),
                });

                const run = await runDoctor({ repoPath, summaryOnly }, ports);

                expect(run.scanWarnings).toEqual([limitWarning]);
            },
        );

        it("should keep the warning out of the evaluated findings", async () => {
            const ports = buildPorts({
                scanRepository: vi
                    .fn()
                    .mockResolvedValue(
                        scanOf([buildRecord()], DIRECTORY_LIMIT),
                    ),
            });

            const run = await runDoctor(
                { repoPath, summaryOnly: false },
                ports,
            );

            expect(run.kind).toBe("evaluated");
            if (run.kind === "evaluated") {
                expect(run.findings.map((f) => f.criterionId)).not.toContain(
                    "discovery-limit-reached",
                );
            }
        });

        it("should still evaluate the records it found", async () => {
            const ports = buildPorts({
                scanRepository: vi
                    .fn()
                    .mockResolvedValue(
                        scanOf([buildRecord()], DIRECTORY_LIMIT),
                    ),
                readIntent: vi
                    .fn()
                    .mockResolvedValue(intentResult("invalid-json")),
            });

            const run = await runDoctor(
                { repoPath, summaryOnly: false },
                ports,
            );

            expect(run.kind).toBe("evaluated");
            if (run.kind === "evaluated") {
                expect(run.findings.map((f) => f.criterionId)).toContain(
                    "invalid-intent-artifact",
                );
            }
        });
    });

    describe("when a step after the scan throws", () => {
        const failure = new Error(chance.sentence());
        const failingSteps = [
            [
                "loading the snapshot reference",
                { summaryOnly: true, records: [buildRecord()] },
                { loadSnapshotRef: vi.fn().mockRejectedValue(failure) },
            ],
            [
                "reading the intent",
                { summaryOnly: false, records: [buildRecord()] },
                { readIntent: vi.fn().mockRejectedValue(failure) },
            ],
            [
                "eliciting the intent",
                { summaryOnly: false, records: sprawlRecords() },
                { elicitIntent: vi.fn().mockRejectedValue(failure) },
            ],
        ] as const;

        it.each(failingSteps)(
            "should fail with the cause and the scan warnings when %s fails",
            async (_step, { summaryOnly, records }, failingPort) => {
                const ports = buildPorts({
                    scanRepository: vi
                        .fn()
                        .mockResolvedValue(
                            scanOf([...records], DIRECTORY_LIMIT),
                        ),
                    ...failingPort,
                });

                const error = await runDoctor(
                    { repoPath, summaryOnly },
                    ports,
                ).catch((caught: unknown) => caught);

                expect(error).toBeInstanceOf(DoctorRunFailure);
                expect(error).toMatchObject({
                    name: "DoctorRunFailure",
                    cause: failure,
                    scanWarnings: [limitWarning],
                    message: failure.message,
                });
            },
        );

        it("should fail with an empty list of scan warnings when the scan covered the whole repository", async () => {
            const ports = buildPorts({
                loadSnapshotRef: vi.fn().mockRejectedValue(failure),
            });

            const error = await runDoctor(
                { repoPath, summaryOnly: true },
                ports,
            ).catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(DoctorRunFailure);
            expect(error).toMatchObject({ cause: failure, scanWarnings: [] });
        });

        it("should describe a cause that is not an Error by its text", async () => {
            const ports = buildPorts({
                loadSnapshotRef: vi.fn().mockRejectedValue("plain text"),
            });

            const error = await runDoctor(
                { repoPath, summaryOnly: true },
                ports,
            ).catch((caught: unknown) => caught);

            expect(error).toMatchObject({
                cause: "plain text",
                message: "plain text",
            });
        });
    });

    describe("when the scan itself throws", () => {
        it("should reject with that error unchanged, because there is nothing to warn about yet", async () => {
            const failure = new Error(chance.sentence());
            const ports = buildPorts({
                scanRepository: vi.fn().mockRejectedValue(failure),
            });

            await expect(
                runDoctor({ repoPath, summaryOnly: false }, ports),
            ).rejects.toBe(failure);
        });
    });

    describe("when the scan reached its depth limit", () => {
        const maxDepth = chance.integer({ min: 1, max: 99 });
        const runShapes = [
            ["a summary", { summaryOnly: true, records: [buildRecord()] }],
            [
                "a run with no agentic constructs",
                { summaryOnly: false, records: [] },
            ],
            [
                "an evaluated run",
                { summaryOnly: false, records: [buildRecord()] },
            ],
        ] as const;

        it.each(runShapes)(
            "should carry exactly one discovery-limit warning that names the depth on %s",
            async (_name, { summaryOnly, records }) => {
                const ports = buildPorts({
                    scanRepository: vi
                        .fn()
                        .mockResolvedValue(
                            scanOf([...records], undefined, { maxDepth }),
                        ),
                });

                const run = await runDoctor({ repoPath, summaryOnly }, ports);

                expect(run.scanWarnings).toEqual([
                    expect.objectContaining({
                        criterionId: "discovery-limit-reached",
                        description: expect.stringContaining(
                            `${maxDepth} directories deep`,
                        ),
                    }),
                ]);
            },
        );
    });

    describe("when the scan skipped symbolic links that lead outside the repository", () => {
        it.each([
            ["a summary", true, [buildRecord()]],
            ["a run with no agentic constructs", false, []],
            ["an evaluated run", false, [buildRecord()]],
        ] as const)(
            "should carry the advisory that names the links on %s",
            async (_name, summaryOnly, records) => {
                const ports = buildPorts({
                    scanRepository: vi.fn().mockResolvedValue({
                        records: [...records],
                        skippedOutsideRoot: ["docs/leak.md"],
                    }),
                });

                const run = await runDoctor({ repoPath, summaryOnly }, ports);

                expect(run.scanWarnings).toEqual([
                    expect.objectContaining({
                        criterionId: "discovery-symlink-skipped",
                        classification: "advisory",
                        description: expect.stringContaining("docs/leak.md"),
                    }),
                ]);
            },
        );
    });

    describe("when a file had more @ imports than the scan checks", () => {
        it.each([
            ["a summary", true, [buildRecord()]],
            ["a run with no agentic constructs", false, []],
            ["an evaluated run", false, [buildRecord()]],
        ] as const)(
            "should carry the advisory that names the limit on %s",
            async (_name, summaryOnly, records) => {
                const ports = buildPorts({
                    scanRepository: vi.fn().mockResolvedValue({
                        records: [...records],
                        importLimit: { maxImports: 256, files: ["CLAUDE.md"] },
                    }),
                });

                const run = await runDoctor({ repoPath, summaryOnly }, ports);

                expect(run.scanWarnings).toEqual([
                    expect.objectContaining({
                        criterionId: "import-limit-reached",
                        classification: "advisory",
                        description: expect.stringContaining("256"),
                    }),
                ]);
            },
        );

        it("should keep the notices in the order the walk, the links and the imports are reported", async () => {
            const ports = buildPorts({
                scanRepository: vi.fn().mockResolvedValue({
                    records: [buildRecord()],
                    directoryLimit: DIRECTORY_LIMIT,
                    skippedOutsideRoot: ["docs/leak.md"],
                    importLimit: { maxImports: 256, files: ["CLAUDE.md"] },
                }),
            });

            const run = await runDoctor({ repoPath, summaryOnly: true }, ports);

            expect(run.scanWarnings.map((f) => f.criterionId)).toEqual([
                "discovery-limit-reached",
                "discovery-symlink-skipped",
                "import-limit-reached",
            ]);
        });
    });

    describe("when the scan reached its entry budget", () => {
        it.each([
            ["a summary", true, [buildRecord()]],
            ["a run with no agentic constructs", false, []],
            ["an evaluated run", false, [buildRecord()]],
        ] as const)(
            "should carry the discovery-limit warning that names the budget on %s",
            async (_name, summaryOnly, records) => {
                const maxEntries = chance.integer({ min: 1, max: 99_999 });
                const ports = buildPorts({
                    scanRepository: vi.fn().mockResolvedValue(
                        scanOf([...records], undefined, undefined, {
                            maxEntries,
                        }),
                    ),
                });

                const run = await runDoctor({ repoPath, summaryOnly }, ports);

                expect(run.scanWarnings).toEqual([
                    expect.objectContaining({
                        criterionId: "discovery-limit-reached",
                        description: expect.stringContaining(
                            `${maxEntries} directory entries`,
                        ),
                    }),
                ]);
            },
        );
    });

    describe("when the scan covered the whole repository", () => {
        const runShapes = [
            ["a summary", { summaryOnly: true, records: [buildRecord()] }],
            [
                "a run with no agentic constructs",
                { summaryOnly: false, records: [] },
            ],
            [
                "an evaluated run",
                { summaryOnly: false, records: [buildRecord()] },
            ],
        ] as const;

        it.each(runShapes)(
            "should carry no scan warnings on %s",
            async (_name, { summaryOnly, records }) => {
                const ports = buildPorts({
                    scanRepository: vi
                        .fn()
                        .mockResolvedValue(scanOf([...records])),
                });

                const run = await runDoctor({ repoPath, summaryOnly }, ports);

                expect(run.scanWarnings).toEqual([]);
            },
        );
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
                            .mockResolvedValue(scanOf(sprawlRecords())),
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

        const presentIntentStatuses = [
            "loaded",
            "invalid-json",
            "invalid-schema",
            "symlink-rejected",
            "read-failed",
        ] as const;

        it.each(presentIntentStatuses)(
            "should not ask questions when the intent load status is %s",
            async (status) => {
                const elicitIntent = vi.fn();
                const ports = buildPorts({
                    scanRepository: vi
                        .fn()
                        .mockResolvedValue(scanOf(sprawlRecords())),
                    readIntent: vi.fn().mockResolvedValue(intentResult(status)),
                    elicitIntent,
                });

                await runDoctor({ repoPath, summaryOnly: false }, ports);

                expect(elicitIntent).not.toHaveBeenCalled();
            },
        );

        it("should not ask anything when there are no ambiguity questions", async () => {
            const elicitIntent = vi.fn();
            const ports = buildPorts({ elicitIntent });

            await runDoctor({ repoPath, summaryOnly: false }, ports);

            expect(elicitIntent).not.toHaveBeenCalled();
        });
    });
});
