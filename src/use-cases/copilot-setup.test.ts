import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import type {
    DetectedEnvironment,
    SetupStepCandidate,
} from "../entities/copilot-setup.js";
import { createWorkflowGateway } from "../gateways/workflow-gateway.js";
import {
    buildCandidatesFromEnvironment,
    findMissingCandidates,
    generateWorkflowContent,
    getExistingActionsFromWorkflow,
    mergeCandidates,
    updateWorkflowWithMissingSteps,
} from "./copilot-setup.js";

const chance = new Chance();

describe("Workflow Generator", () => {
    describe("buildCandidatesFromEnvironment", () => {
        describe("when mise.toml is detected", () => {
            it("should return only mise-action candidate when mise.toml is present", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: true,
                    versionFiles: [
                        { type: "node", filename: ".nvmrc", version: "20.0.0" },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0]).toMatchObject({
                    action: "jdx/mise-action",
                    source: "version-file",
                });
            });
        });

        describe("when version files are detected without mise", () => {
            it("should create setup-node candidate from .nvmrc", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        { type: "node", filename: ".nvmrc", version: "20.0.0" },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        action: "actions/setup-node",
                        config: { "node-version-file": ".nvmrc" },
                    }),
                );
            });

            it("should create setup-python candidate from .python-version", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "python",
                            filename: ".python-version",
                            version: "3.12.0",
                        },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        action: "actions/setup-python",
                        config: { "python-version-file": ".python-version" },
                    }),
                );
            });

            it("should deduplicate candidates for same type (e.g., .nvmrc and .node-version)", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        { type: "node", filename: ".nvmrc", version: "20.0.0" },
                        {
                            type: "node",
                            filename: ".node-version",
                            version: "20.0.0",
                        },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                const nodeCandidates = result.filter(
                    (c) => c.action === "actions/setup-node",
                );
                expect(nodeCandidates).toHaveLength(1);
            });

            it("should create candidates for multiple different version file types", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        { type: "node", filename: ".nvmrc", version: "20.0.0" },
                        {
                            type: "python",
                            filename: ".python-version",
                            version: "3.12.0",
                        },
                        {
                            type: "go",
                            filename: ".go-version",
                            version: "1.22",
                        },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toHaveLength(3);
                expect(result.map((c) => c.action)).toContain(
                    "actions/setup-node",
                );
                expect(result.map((c) => c.action)).toContain(
                    "actions/setup-python",
                );
                expect(result.map((c) => c.action)).toContain(
                    "actions/setup-go",
                );
            });
        });

        describe("when no configuration files exist", () => {
            it("should return empty array when no version files detected", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toHaveLength(0);
            });
        });
    });

    describe("mergeCandidates", () => {
        it("should prefer workflow-sourced candidates over environment candidates", () => {
            // Arrange
            const envCandidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    config: { "node-version-file": ".nvmrc" },
                    source: "version-file",
                },
            ];
            const workflowCandidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    config: { "node-version": "20" },
                    source: "workflow",
                },
            ];

            // Act
            const result = mergeCandidates(envCandidates, workflowCandidates);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].source).toBe("workflow");
            expect(result[0].config).toEqual({ "node-version": "20" });
        });

        it("should include unique candidates from both sources", () => {
            // Arrange
            const envCandidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-python",
                    version: "v5",
                    source: "version-file",
                },
            ];
            const workflowCandidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "workflow",
                },
            ];

            // Act
            const result = mergeCandidates(envCandidates, workflowCandidates);

            // Assert
            expect(result).toHaveLength(2);
            expect(result.map((c) => c.action)).toContain("actions/setup-node");
            expect(result.map((c) => c.action)).toContain(
                "actions/setup-python",
            );
        });
    });

    describe("generateWorkflowContent", () => {
        it("should generate valid YAML workflow content", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const content = await generateWorkflowContent(candidates);
            const parsed = parseYaml(content);

            // Assert
            expect(parsed.name).toBe("Copilot Setup Steps");
            expect(parsed.jobs["copilot-setup-steps"]).toBeDefined();
        });

        it("should include checkout step as first step", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const content = await generateWorkflowContent(candidates);
            const parsed = parseYaml(content);

            // Assert
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps[0].uses).toContain("actions/checkout");
        });

        it("should include all setup step candidates", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
                {
                    action: "actions/setup-python",
                    version: "v5",
                    source: "version-file",
                },
            ];

            // Act
            const content = await generateWorkflowContent(candidates);
            const parsed = parseYaml(content);

            // Assert
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-node"),
                ),
            ).toBe(true);
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-python"),
                ),
            ).toBe(true);
        });

        it("should include proper workflow triggers", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [];

            // Act
            const content = await generateWorkflowContent(candidates);
            const parsed = parseYaml(content);

            // Assert
            expect(parsed.on.workflow_dispatch).toBeDefined();
            expect(parsed.on.push).toBeDefined();
            expect(parsed.on.pull_request).toBeDefined();
        });

        it("should include proper permissions", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [];

            // Act
            const content = await generateWorkflowContent(candidates);
            const parsed = parseYaml(content);

            // Assert
            const job = parsed.jobs["copilot-setup-steps"];
            expect(job.permissions["id-token"]).toBe("write");
            expect(job.permissions.contents).toBe("read");
        });

        it("should preserve config in with block", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    config: { "node-version-file": ".nvmrc" },
                    source: "version-file",
                },
            ];

            // Act
            const content = await generateWorkflowContent(candidates);
            const parsed = parseYaml(content);

            // Assert
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            const nodeStep = steps.find((s: { uses: string }) =>
                s.uses.includes("actions/setup-node"),
            );
            expect(nodeStep.with["node-version-file"]).toBe(".nvmrc");
        });
    });

    describe("getExistingActionsFromWorkflow", () => {
        it("should extract action names from workflow steps", () => {
            // Arrange
            const workflow = {
                jobs: {
                    build: {
                        steps: [
                            { uses: "actions/checkout@v4" },
                            { uses: "actions/setup-node@v4" },
                        ],
                    },
                },
            };

            // Act
            const result = getExistingActionsFromWorkflow(workflow);

            // Assert
            expect(result.has("actions/checkout")).toBe(true);
            expect(result.has("actions/setup-node")).toBe(true);
        });

        it("should return empty set for invalid workflow", () => {
            // Arrange
            const workflow = null;

            // Act
            const result = getExistingActionsFromWorkflow(workflow);

            // Assert
            expect(result.size).toBe(0);
        });
    });

    describe("findMissingCandidates", () => {
        it("should return candidates not present in existing actions", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
                {
                    action: "actions/setup-python",
                    version: "v5",
                    source: "version-file",
                },
            ];
            const existingActions = new Set(["actions/setup-node"]);

            // Act
            const result = findMissingCandidates(candidates, existingActions);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].action).toBe("actions/setup-python");
        });

        it("should return empty array when all candidates exist", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];
            const existingActions = new Set(["actions/setup-node"]);

            // Act
            const result = findMissingCandidates(candidates, existingActions);

            // Assert
            expect(result).toHaveLength(0);
        });
    });

    describe("updateWorkflowWithMissingSteps", () => {
        it("should append missing steps to existing workflow", async () => {
            // Arrange
            const existingWorkflow = {
                name: "Copilot Setup Steps",
                jobs: {
                    "copilot-setup-steps": {
                        steps: [{ uses: "actions/checkout@v4" }],
                    },
                },
            };
            const missingCandidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const content = await updateWorkflowWithMissingSteps(
                existingWorkflow,
                missingCandidates,
            );
            const parsed = parseYaml(content);

            // Assert
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps).toHaveLength(2);
            expect(steps[1].uses).toContain("actions/setup-node");
        });

        it("should preserve existing workflow content", async () => {
            // Arrange
            const existingWorkflow = {
                name: "My Custom Workflow",
                on: { push: { branches: ["develop"] } },
                jobs: {
                    build: {
                        "runs-on": "self-hosted",
                        steps: [{ uses: "actions/checkout@v4" }],
                    },
                },
            };
            const missingCandidates: SetupStepCandidate[] = [];

            // Act
            const content = await updateWorkflowWithMissingSteps(
                existingWorkflow,
                missingCandidates,
            );
            const parsed = parseYaml(content);

            // Assert
            expect(parsed.name).toBe("My Custom Workflow");
            expect(parsed.on.push.branches).toContain("develop");
            expect(parsed.jobs.build["runs-on"]).toBe("self-hosted");
        });
    });

    describe("writeCopilotSetupWorkflow (via gateway)", () => {
        let testDir: string;
        let workflowsDir: string;
        const workflowGateway = createWorkflowGateway();

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-write-${chance.guid()}`);
            workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should write workflow file to correct location", async () => {
            // Arrange
            const content = "name: Test Workflow";

            // Act
            await workflowGateway.writeCopilotSetupWorkflow(testDir, content);

            // Assert
            const writtenContent = await readFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                "utf-8",
            );
            expect(writtenContent).toBe(content);
        });
    });
});
