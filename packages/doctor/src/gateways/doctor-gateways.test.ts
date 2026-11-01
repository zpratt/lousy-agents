import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { createConsola } from "consola";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeclaredIntentArtifact } from "../entities/declared-intent.js";
import { createDoctorGateways } from "./doctor-gateways.js";
import { writeIntentArtifact } from "./intent-artifact.js";

const chance = new Chance();

const WISDOM_UNAVAILABLE_DEBUG_MESSAGE =
    "Wisdom graph unavailable — snapshotRef will be omitted";

function buildGateways() {
    const debugged: string[] = [];
    const logger = createConsola({
        level: 4,
        reporters: [
            {
                log: (entry) => {
                    if (entry.type === "debug") {
                        debugged.push(entry.args.join(" "));
                    }
                },
            },
        ],
    });
    return { gateways: createDoctorGateways(logger), debugged };
}

async function writeWisdomGraph(
    repoPath: string,
    graph: unknown,
): Promise<void> {
    const graphDirectory = join(repoPath, "wisdom", "graphify-out");
    await mkdir(graphDirectory, { recursive: true });
    await writeFile(join(graphDirectory, "graph.json"), JSON.stringify(graph));
}

describe("createDoctorGateways", () => {
    let repoPath: string;

    beforeEach(async () => {
        repoPath = await realpath(
            await mkdtemp(join(tmpdir(), "doctor-gateways-")),
        );
    });

    afterEach(async () => {
        await rm(repoPath, { recursive: true, force: true });
    });

    describe("loadSnapshotRef", () => {
        describe("when the repository has a wisdom graph", () => {
            it("should return the snapshot reference of the graph", async () => {
                const snapshotRef = chance.hash();
                await writeWisdomGraph(repoPath, { nodes: [], snapshotRef });
                const { gateways, debugged } = buildGateways();

                const result = await gateways.loadSnapshotRef(repoPath);

                expect(result).toBe(snapshotRef);
                expect(debugged).toEqual([]);
            });
        });

        describe("when the repository has a wisdom graph without a snapshot reference", () => {
            it("should return undefined", async () => {
                await writeWisdomGraph(repoPath, { nodes: [] });
                const { gateways } = buildGateways();

                const result = await gateways.loadSnapshotRef(repoPath);

                expect(result).toBeUndefined();
            });
        });

        describe("when the repository has no wisdom graph", () => {
            it("should return undefined and log why at debug level", async () => {
                const { gateways, debugged } = buildGateways();

                const result = await gateways.loadSnapshotRef(repoPath);

                expect(result).toBeUndefined();
                expect(debugged).toEqual([WISDOM_UNAVAILABLE_DEBUG_MESSAGE]);
            });
        });

        describe("when the wisdom graph exists only under a different directory name", () => {
            it("should not read it", async () => {
                const snapshotRef = chance.hash();
                const graphDirectory = join(
                    repoPath,
                    "wisdom-x",
                    "graphify-out",
                );
                await mkdir(graphDirectory, { recursive: true });
                await writeFile(
                    join(graphDirectory, "graph.json"),
                    JSON.stringify({ nodes: [], snapshotRef }),
                );
                const { gateways } = buildGateways();

                const result = await gateways.loadSnapshotRef(repoPath);

                expect(result).toBeUndefined();
            });
        });

        describe("when something other than an unavailable graph goes wrong", () => {
            it("should rethrow the error instead of treating it as a missing graph", async () => {
                const { gateways, debugged } = buildGateways();
                const invalidRepoPath = chance.integer() as unknown as string;

                await expect(
                    gateways.loadSnapshotRef(invalidRepoPath),
                ).rejects.toThrow(TypeError);
                expect(debugged).toEqual([]);
            });
        });
    });

    describe("readIntent", () => {
        describe("when the repository declares intent", () => {
            it("should return the artifact with a loaded report", async () => {
                const artifact: DeclaredIntentArtifact = {
                    targetHarnesses: ["claude", "copilot"],
                    desiredCapabilities: [chance.word()],
                    confirmedAnswers: {},
                    intentSource: "pre-committed",
                };
                const artifactPath = await writeIntentArtifact(
                    repoPath,
                    artifact,
                );
                const { gateways } = buildGateways();

                const result = await gateways.readIntent(repoPath);

                expect(result).toEqual({
                    intent: artifact,
                    report: { status: "loaded", checkedPath: artifactPath },
                });
            });
        });

        describe("when the repository declares no intent", () => {
            it("should return no artifact with an absent report", async () => {
                const { gateways } = buildGateways();

                const result = await gateways.readIntent(repoPath);

                expect(result.intent).toBeNull();
                expect(result.report.status).toBe("absent");
            });
        });
    });
});
