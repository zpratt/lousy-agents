import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import type { DetectedEnvironment } from "./environment-detector.js";
import {
    buildCandidatesFromEnvironment,
    COPILOT_SETUP_WORKFLOW_PATH,
    createOrUpdateWorkflow,
    extractExistingActions,
    generateWorkflowYaml,
    mergeCandidates,
    updateWorkflow,
} from "./workflow-generator.js";
import type { SetupStepCandidate } from "./workflow-parser.js";

const chance = new Chance();

describe("Workflow generator", () => {
    describe("buildCandidatesFromEnvironment", () => {
        it("should create mise-action candidate when mise.toml is present", () => {
            // Arrange
            const environment: DetectedEnvironment = {
                hasMise: true,
                versionFiles: [],
            };

            // Act
            const result = buildCandidatesFromEnvironment(environment);

            // Assert
            expect(result).toContainEqual({
                action: "jdx/mise-action",
                version: "v2",
                source: "version-file",
            });
        });

        it("should create setup-node candidate from .nvmrc when mise is not present", () => {
            // Arrange
            const environment: DetectedEnvironment = {
                hasMise: false,
                versionFiles: [
                    { type: "node", filename: ".nvmrc", version: "20" },
                ],
            };

            // Act
            const result = buildCandidatesFromEnvironment(environment);

            // Assert
            expect(result).toContainEqual({
                action: "actions/setup-node",
                version: "v4",
                config: { "node-version-file": ".nvmrc" },
                source: "version-file",
            });
        });

        it("should create setup-python candidate from .python-version when mise is not present", () => {
            // Arrange
            const environment: DetectedEnvironment = {
                hasMise: false,
                versionFiles: [
                    {
                        type: "python",
                        filename: ".python-version",
                        version: "3.12",
                    },
                ],
            };

            // Act
            const result = buildCandidatesFromEnvironment(environment);

            // Assert
            expect(result).toContainEqual({
                action: "actions/setup-python",
                version: "v5",
                config: { "python-version-file": ".python-version" },
                source: "version-file",
            });
        });

        it("should skip version file candidates when mise.toml is present", () => {
            // Arrange
            const environment: DetectedEnvironment = {
                hasMise: true,
                versionFiles: [
                    { type: "node", filename: ".nvmrc", version: "20" },
                ],
            };

            // Act
            const result = buildCandidatesFromEnvironment(environment);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].action).toBe("jdx/mise-action");
        });

        it("should deduplicate node candidates when both .nvmrc and .node-version exist", () => {
            // Arrange
            const environment: DetectedEnvironment = {
                hasMise: false,
                versionFiles: [
                    { type: "node", filename: ".nvmrc", version: "20" },
                    { type: "node", filename: ".node-version", version: "20" },
                ],
            };

            // Act
            const result = buildCandidatesFromEnvironment(environment);

            // Assert
            const nodeActions = result.filter(
                (c) => c.action === "actions/setup-node",
            );
            expect(nodeActions).toHaveLength(1);
            // Should use first file encountered (.nvmrc)
            expect(nodeActions[0].config?.["node-version-file"]).toBe(".nvmrc");
        });

        it("should create candidates for multiple language version files", () => {
            // Arrange
            const environment: DetectedEnvironment = {
                hasMise: false,
                versionFiles: [
                    { type: "node", filename: ".nvmrc", version: "20" },
                    {
                        type: "python",
                        filename: ".python-version",
                        version: "3.12",
                    },
                    { type: "go", filename: ".go-version", version: "1.22" },
                ],
            };

            // Act
            const result = buildCandidatesFromEnvironment(environment);

            // Assert
            expect(result).toHaveLength(3);
            expect(result.map((c) => c.action)).toContain("actions/setup-node");
            expect(result.map((c) => c.action)).toContain(
                "actions/setup-python",
            );
            expect(result.map((c) => c.action)).toContain("actions/setup-go");
        });

        it("should return empty array when no configuration files present", () => {
            // Arrange
            const environment: DetectedEnvironment = {
                hasMise: false,
                versionFiles: [],
            };

            // Act
            const result = buildCandidatesFromEnvironment(environment);

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe("mergeCandidates", () => {
        it("should merge candidates from both sources", () => {
            // Arrange
            const envCandidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];
            const workflowCandidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-python",
                    version: "v5",
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

        it("should prefer workflow candidate config over environment candidate", () => {
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
            expect(result[0].config).toEqual({ "node-version": "20" });
            expect(result[0].source).toBe("workflow");
        });

        it("should handle empty workflow candidates", () => {
            // Arrange
            const envCandidates: SetupStepCandidate[] = [
                {
                    action: "jdx/mise-action",
                    version: "v2",
                    source: "version-file",
                },
            ];

            // Act
            const result = mergeCandidates(envCandidates, []);

            // Assert
            expect(result).toEqual(envCandidates);
        });

        it("should handle empty environment candidates", () => {
            // Arrange
            const workflowCandidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "workflow",
                },
            ];

            // Act
            const result = mergeCandidates([], workflowCandidates);

            // Assert
            expect(result).toEqual(workflowCandidates);
        });
    });

    describe("generateWorkflowYaml", () => {
        it("should generate valid YAML workflow", () => {
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
            const result = generateWorkflowYaml(candidates);

            // Assert
            const parsed = parseYaml(result);
            expect(parsed).toBeDefined();
            expect(parsed.name).toBe("Copilot Setup Steps");
        });

        it("should include checkout step as first step", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [];

            // Act
            const result = generateWorkflowYaml(candidates);

            // Assert
            const parsed = parseYaml(result);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps[0].name).toBe("Checkout");
            expect(steps[0].uses).toBe("actions/checkout@v4");
        });

        it("should include setup steps after checkout", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const result = generateWorkflowYaml(candidates);

            // Assert
            const parsed = parseYaml(result);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps).toHaveLength(2);
            expect(steps[1].uses).toBe("actions/setup-node@v4");
        });

        it("should include action config in with block", () => {
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
            const result = generateWorkflowYaml(candidates);

            // Assert
            const parsed = parseYaml(result);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps[1].with).toEqual({ "node-version-file": ".nvmrc" });
        });

        it("should include workflow_dispatch and pull_request triggers", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [];

            // Act
            const result = generateWorkflowYaml(candidates);

            // Assert
            const parsed = parseYaml(result);
            expect(parsed.on).toHaveProperty("workflow_dispatch");
            expect(parsed.on).toHaveProperty("pull_request");
        });

        it("should include required permissions", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [];

            // Act
            const result = generateWorkflowYaml(candidates);

            // Assert
            const parsed = parseYaml(result);
            expect(parsed.permissions.contents).toBe("read");
            expect(parsed.permissions["id-token"]).toBe("write");
        });

        it("should use ubuntu-latest runner", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [];

            // Act
            const result = generateWorkflowYaml(candidates);

            // Assert
            const parsed = parseYaml(result);
            expect(parsed.jobs["copilot-setup-steps"]["runs-on"]).toBe(
                "ubuntu-latest",
            );
        });

        it("should order mise-action before other setup actions", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
                {
                    action: "jdx/mise-action",
                    version: "v2",
                    source: "version-file",
                },
            ];

            // Act
            const result = generateWorkflowYaml(candidates);

            // Assert
            const parsed = parseYaml(result);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            // Checkout is first, then mise, then setup-node
            expect(steps[1].uses).toBe("jdx/mise-action@v2");
            expect(steps[2].uses).toBe("actions/setup-node@v4");
        });
    });

    describe("extractExistingActions", () => {
        it("should extract action names from workflow", () => {
            // Arrange
            const workflowContent = `
name: Test
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`;

            // Act
            const result = extractExistingActions(workflowContent);

            // Assert
            expect(result).toContain("actions/checkout");
            expect(result).toContain("actions/setup-node");
        });

        it("should strip version from action names", () => {
            // Arrange
            const workflowContent = `
name: Test
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@60a0d83bf581b792aa7057695fe3246d4474d130
`;

            // Act
            const result = extractExistingActions(workflowContent);

            // Assert
            expect(result).toContain("actions/setup-node");
            expect(result).not.toContain(
                "actions/setup-node@60a0d83bf581b792aa7057695fe3246d4474d130",
            );
        });

        it("should return empty array for invalid YAML", () => {
            // Arrange
            const invalidYaml = "this is not: valid: yaml:";

            // Act
            const result = extractExistingActions(invalidYaml);

            // Assert
            expect(result).toEqual([]);
        });

        it("should return empty array for workflow without jobs", () => {
            // Arrange
            const workflowContent = `
name: Empty
on: [push]
`;

            // Act
            const result = extractExistingActions(workflowContent);

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe("updateWorkflow", () => {
        it("should append missing steps to existing workflow", () => {
            // Arrange
            const existingContent = `
name: Copilot Setup Steps
on:
  workflow_dispatch: {}
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    config: { "node-version-file": ".nvmrc" },
                    source: "version-file",
                },
            ];

            // Act
            const result = updateWorkflow(existingContent, candidates);

            // Assert
            expect(result.updated).toBe(true);
            expect(result.addedSteps).toContain("actions/setup-node");
            const parsed = parseYaml(result.content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps).toHaveLength(2);
        });

        it("should not update when all candidates already present", () => {
            // Arrange
            const existingContent = `
name: Copilot Setup Steps
on:
  workflow_dispatch: {}
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`;
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const result = updateWorkflow(existingContent, candidates);

            // Assert
            expect(result.updated).toBe(false);
            expect(result.addedSteps).toEqual([]);
            expect(result.content).toBe(existingContent);
        });

        it("should preserve existing workflow content", () => {
            // Arrange
            const existingContent = `
name: Copilot Setup Steps
on:
  workflow_dispatch: {}
  pull_request: {}
permissions:
  contents: read
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
`;
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const result = updateWorkflow(existingContent, candidates);

            // Assert
            const parsed = parseYaml(result.content);
            expect(parsed.name).toBe("Copilot Setup Steps");
            expect(parsed.on).toHaveProperty("workflow_dispatch");
            expect(parsed.on).toHaveProperty("pull_request");
            expect(parsed.permissions.contents).toBe("read");
        });

        it("should only add candidates not already in workflow", () => {
            // Arrange
            const existingContent = `
name: Copilot Setup Steps
on:
  workflow_dispatch: {}
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`;
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
            const result = updateWorkflow(existingContent, candidates);

            // Assert
            expect(result.updated).toBe(true);
            expect(result.addedSteps).toEqual(["actions/setup-python"]);
            expect(result.addedSteps).not.toContain("actions/setup-node");
        });
    });

    describe("createOrUpdateWorkflow", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-gen-${chance.guid()}`);
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should create new workflow when file does not exist", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const result = await createOrUpdateWorkflow(testDir, candidates);

            // Assert
            expect(result.created).toBe(true);
            expect(result.updated).toBe(false);
            expect(result.addedSteps).toContain("actions/setup-node");

            // Verify file was created
            const content = await readFile(
                join(testDir, COPILOT_SETUP_WORKFLOW_PATH),
                "utf-8",
            );
            expect(content).toContain("actions/setup-node");
        });

        it("should update existing workflow with missing steps", async () => {
            // Arrange
            const existingContent = `
name: Copilot Setup Steps
on:
  workflow_dispatch: {}
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            await writeFile(workflowPath, existingContent);

            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const result = await createOrUpdateWorkflow(testDir, candidates);

            // Assert
            expect(result.created).toBe(false);
            expect(result.updated).toBe(true);
            expect(result.addedSteps).toContain("actions/setup-node");

            // Verify file was updated
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-node");
        });

        it("should not modify file when no changes needed", async () => {
            // Arrange
            const existingContent = `
name: Copilot Setup Steps
on:
  workflow_dispatch: {}
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`;
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            await writeFile(workflowPath, existingContent);

            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "version-file",
                },
            ];

            // Act
            const result = await createOrUpdateWorkflow(testDir, candidates);

            // Assert
            expect(result.created).toBe(false);
            expect(result.updated).toBe(false);
            expect(result.addedSteps).toEqual([]);
        });

        it("should create minimal workflow when no candidates provided", async () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [];

            // Act
            const result = await createOrUpdateWorkflow(testDir, candidates);

            // Assert
            expect(result.created).toBe(true);

            // Verify file contains at least checkout
            const content = await readFile(
                join(testDir, COPILOT_SETUP_WORKFLOW_PATH),
                "utf-8",
            );
            expect(content).toContain("actions/checkout");
        });
    });
});
