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
    generateWorkflowContent,
    updateWorkflowWithMissingSteps,
} from "./copilot-setup.js";
import {
    findMissingCandidates,
    getExistingActionsFromWorkflow,
    mergeCandidates,
} from "./setup-step-discovery.js";

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
                    packageManagers: [],
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
                    packageManagers: [],
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
                    packageManagers: [],
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
                    packageManagers: [],
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
                    packageManagers: [],
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

        describe("when package managers are detected", () => {
            it("should create install step for npm", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        { type: "node", filename: ".nvmrc", version: "20.0.0" },
                    ],
                    packageManagers: [
                        {
                            type: "npm",
                            filename: "package.json",
                            lockfile: "package-lock.json",
                        },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        name: "Install dependencies",
                        run: "npm ci",
                        source: "version-file",
                    }),
                );
            });

            it("should create install step for yarn", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        { type: "node", filename: ".nvmrc", version: "20.0.0" },
                    ],
                    packageManagers: [
                        {
                            type: "yarn",
                            filename: "package.json",
                            lockfile: "yarn.lock",
                        },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        name: "Install dependencies",
                        run: "yarn install --frozen-lockfile",
                        source: "version-file",
                    }),
                );
            });

            it("should create install step for pip", async () => {
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
                    packageManagers: [
                        { type: "pip", filename: "requirements.txt" },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        name: "Install dependencies",
                        run: "pip install -r requirements.txt",
                        source: "version-file",
                    }),
                );
            });

            it("should create install step for bundler", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "ruby",
                            filename: ".ruby-version",
                            version: "3.2.0",
                        },
                    ],
                    packageManagers: [
                        {
                            type: "bundler",
                            filename: "Gemfile",
                            lockfile: "Gemfile.lock",
                        },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        name: "Install dependencies",
                        run: "bundle install",
                        source: "version-file",
                    }),
                );
            });

            it("should deduplicate install steps for same package manager type", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        { type: "node", filename: ".nvmrc", version: "20.0.0" },
                    ],
                    packageManagers: [
                        {
                            type: "npm",
                            filename: "package.json",
                            lockfile: "package-lock.json",
                        },
                        {
                            type: "npm",
                            filename: "package.json",
                            lockfile: "package-lock.json",
                        },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                const installSteps = result.filter((c) => c.run === "npm ci");
                expect(installSteps).toHaveLength(1);
            });

            it("should not create install step when mise is detected", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: true,
                    versionFiles: [
                        { type: "node", filename: ".nvmrc", version: "20.0.0" },
                    ],
                    packageManagers: [
                        {
                            type: "npm",
                            filename: "package.json",
                            lockfile: "package-lock.json",
                        },
                    ],
                };

                // Act
                const result =
                    await buildCandidatesFromEnvironment(environment);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].action).toBe("jdx/mise-action");
                expect(result.filter((c) => c.run)).toHaveLength(0);
            });
        });

        describe("when no configuration files exist", () => {
            it("should return empty array when no version files detected", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [],
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

            // Act - workflow candidates passed first to take precedence
            const result = mergeCandidates(workflowCandidates, envCandidates);

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

        it("should include install steps with run command", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
                {
                    action: "",
                    run: "npm ci",
                    name: "Install dependencies",
                    source: "version-file",
                },
            ];

            // Act
            const content = await generateWorkflowContent(candidates);
            const parsed = parseYaml(content);

            // Assert
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            const installStep = steps.find(
                (s: { name?: string }) => s.name === "Install dependencies",
            );
            expect(installStep).toBeDefined();
            expect(installStep.run).toBe("npm ci");
            expect(installStep.uses).toBeUndefined();
        });

        it("should include custom step name when provided", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                    name: "Setup Node.js environment",
                },
            ];

            // Act
            const content = await generateWorkflowContent(candidates);
            const parsed = parseYaml(content);

            // Assert
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            const nodeStep = steps.find(
                (s: { name?: string }) =>
                    s.name === "Setup Node.js environment",
            );
            expect(nodeStep).toBeDefined();
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

    describe("generateWorkflowContent with placeholder mode", () => {
        it("should use RESOLVE_VERSION placeholder when usePlaceholders is true", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const content = await generateWorkflowContent(
                candidates,
                undefined,
                { usePlaceholders: true },
            );
            const parsed = parseYaml(content);

            // Assert
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps[0].uses).toBe("actions/checkout@RESOLVE_VERSION");
            expect(steps[1].uses).toBe("actions/setup-node@RESOLVE_VERSION");
        });

        it("should use SHA-pinned format when resolvedVersions is provided", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];
            const resolvedVersions = [
                {
                    action: "actions/checkout",
                    sha: "abc123def456",
                    versionTag: "v4.1.0",
                },
                {
                    action: "actions/setup-node",
                    sha: "789xyz012abc",
                    versionTag: "v4.0.2",
                },
            ];

            // Act
            const content = await generateWorkflowContent(
                candidates,
                undefined,
                { resolvedVersions },
            );
            const parsed = parseYaml(content);

            // Assert - parsed YAML only contains action@sha (version is a YAML comment)
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps[0].uses).toBe("actions/checkout@abc123def456");
            expect(steps[1].uses).toBe("actions/setup-node@789xyz012abc");
            // Verify the raw YAML contains the version comment
            expect(content).toContain("# v4.1.0");
            expect(content).toContain("# v4.0.2");
        });

        it("should output SHA-pinned action references without quotes in raw YAML", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];
            const resolvedVersions = [
                {
                    action: "actions/checkout",
                    sha: "abc123def456",
                    versionTag: "v4.1.0",
                },
                {
                    action: "actions/setup-node",
                    sha: "789xyz012abc",
                    versionTag: "v4.0.2",
                },
            ];

            // Act
            const content = await generateWorkflowContent(
                candidates,
                undefined,
                { resolvedVersions },
            );

            // Assert - verify raw YAML does not contain quoted action references
            // The YAML should have unquoted action references like:
            //   uses: actions/checkout@abc123def456  # v4.1.0
            // Not quoted like:
            //   uses: "actions/checkout@abc123def456  # v4.1.0"
            expect(content).toContain("uses: actions/checkout@abc123def456");
            expect(content).toContain("uses: actions/setup-node@789xyz012abc");
            expect(content).not.toContain('"actions/checkout@');
            expect(content).not.toContain('"actions/setup-node@');
        });

        it("should use placeholder for unresolved actions when partially resolved", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];
            const resolvedVersions = [
                {
                    action: "actions/checkout",
                    sha: "abc123def456",
                    versionTag: "v4.1.0",
                },
            ];

            // Act
            const content = await generateWorkflowContent(
                candidates,
                undefined,
                { usePlaceholders: true, resolvedVersions },
            );
            const parsed = parseYaml(content);

            // Assert - parsed YAML only contains action@sha (version is a YAML comment)
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps[0].uses).toBe("actions/checkout@abc123def456");
            expect(steps[1].uses).toBe("actions/setup-node@RESOLVE_VERSION");
            // Verify the raw YAML contains the version comment
            expect(content).toContain("# v4.1.0");
        });
    });
});
