import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    analyzeCopilotWorkflowNeeds,
    checkExistingCopilotWorkflow,
    detectVersionFiles,
    determineMissingSetupSteps,
    generateCopilotWorkflowContent,
    PINNED_ACTIONS,
    parseAllWorkflowSetupSteps,
    parseWorkflowSetupSteps,
} from "./copilot-workflow.js";
import { getPinnedActionReference } from "./pinned-actions.js";

const chance = new Chance();

describe("copilot-workflow", () => {
    describe("detectVersionFiles", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should detect .nvmrc file and return node runtime candidate", async () => {
            // Arrange
            const nvmrcContent = "20.10.0";
            await writeFile(join(testDir, ".nvmrc"), nvmrcContent);

            // Act
            const candidates = await detectVersionFiles(testDir);

            // Assert
            expect(candidates).toHaveLength(1);
            expect(candidates[0]).toEqual({
                file: ".nvmrc",
                runtime: "node",
                setupAction: "actions/setup-node",
                version: nvmrcContent,
            });
        });

        it("should detect .python-version file and return python runtime candidate", async () => {
            // Arrange
            const pythonVersion = "3.12.0";
            await writeFile(join(testDir, ".python-version"), pythonVersion);

            // Act
            const candidates = await detectVersionFiles(testDir);

            // Assert
            expect(candidates).toHaveLength(1);
            expect(candidates[0]).toEqual({
                file: ".python-version",
                runtime: "python",
                setupAction: "actions/setup-python",
                version: pythonVersion,
            });
        });

        it("should detect mise.toml file and return mise runtime candidate", async () => {
            // Arrange
            await writeFile(
                join(testDir, "mise.toml"),
                "[tools]\nnode = '20'\n",
            );

            // Act
            const candidates = await detectVersionFiles(testDir);

            // Assert
            expect(candidates).toHaveLength(1);
            expect(candidates[0]).toEqual({
                file: "mise.toml",
                runtime: "mise",
                setupAction: "jdx/mise-action",
                version: undefined,
            });
        });

        it("should detect multiple version files when present", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");
            await writeFile(join(testDir, ".python-version"), "3.12.0");
            await writeFile(join(testDir, "mise.toml"), "[tools]\n");

            // Act
            const candidates = await detectVersionFiles(testDir);

            // Assert
            expect(candidates).toHaveLength(3);
            const runtimes = candidates.map((c) => c.runtime);
            expect(runtimes).toContain("node");
            expect(runtimes).toContain("python");
            expect(runtimes).toContain("mise");
        });

        it("should return empty array when no version files exist", async () => {
            // Arrange - testDir is empty

            // Act
            const candidates = await detectVersionFiles(testDir);

            // Assert
            expect(candidates).toHaveLength(0);
        });

        it("should detect .java-version file and return java runtime candidate", async () => {
            // Arrange
            const javaVersion = "21";
            await writeFile(join(testDir, ".java-version"), javaVersion);

            // Act
            const candidates = await detectVersionFiles(testDir);

            // Assert
            expect(candidates).toHaveLength(1);
            expect(candidates[0]).toEqual({
                file: ".java-version",
                runtime: "java",
                setupAction: "actions/setup-java",
                version: javaVersion,
            });
        });

        it("should detect .ruby-version file and return ruby runtime candidate", async () => {
            // Arrange
            const rubyVersion = "3.3.0";
            await writeFile(join(testDir, ".ruby-version"), rubyVersion);

            // Act
            const candidates = await detectVersionFiles(testDir);

            // Assert
            expect(candidates).toHaveLength(1);
            expect(candidates[0]).toEqual({
                file: ".ruby-version",
                runtime: "ruby",
                setupAction: "ruby/setup-ruby",
                version: rubyVersion,
            });
        });

        it("should detect .go-version file and return go runtime candidate", async () => {
            // Arrange
            const goVersion = "1.22.0";
            await writeFile(join(testDir, ".go-version"), goVersion);

            // Act
            const candidates = await detectVersionFiles(testDir);

            // Assert
            expect(candidates).toHaveLength(1);
            expect(candidates[0]).toEqual({
                file: ".go-version",
                runtime: "go",
                setupAction: "actions/setup-go",
                version: goVersion,
            });
        });
    });

    describe("parseWorkflowSetupSteps", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should extract setup-node action from workflow", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
`;
            const workflowPath = join(testDir, "workflow.yml");
            await writeFile(workflowPath, workflowContent);

            // Act
            const steps = await parseWorkflowSetupSteps(workflowPath);

            // Assert
            expect(steps).toHaveLength(1);
            expect(steps[0].action).toBe("actions/setup-node");
            expect(steps[0].with).toEqual({ "node-version": "20" });
        });

        it("should extract multiple setup actions from workflow", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
`;
            const workflowPath = join(testDir, "workflow.yml");
            await writeFile(workflowPath, workflowContent);

            // Act
            const steps = await parseWorkflowSetupSteps(workflowPath);

            // Assert
            expect(steps).toHaveLength(2);
            expect(steps.map((s) => s.action)).toEqual([
                "actions/setup-node",
                "actions/setup-python",
            ]);
        });

        it("should extract jdx/mise-action from workflow", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jdx/mise-action@v2
        with:
          github_token: \${{ github.token }}
`;
            const workflowPath = join(testDir, "workflow.yml");
            await writeFile(workflowPath, workflowContent);

            // Act
            const steps = await parseWorkflowSetupSteps(workflowPath);

            // Assert
            expect(steps).toHaveLength(1);
            expect(steps[0].action).toBe("jdx/mise-action");
        });

        it("should return empty array for workflow without setup actions", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello"
`;
            const workflowPath = join(testDir, "workflow.yml");
            await writeFile(workflowPath, workflowContent);

            // Act
            const steps = await parseWorkflowSetupSteps(workflowPath);

            // Assert
            expect(steps).toHaveLength(0);
        });

        it("should return empty array for invalid YAML", async () => {
            // Arrange
            const workflowPath = join(testDir, "workflow.yml");
            await writeFile(workflowPath, "invalid: yaml: content: [");

            // Act
            const steps = await parseWorkflowSetupSteps(workflowPath);

            // Assert
            expect(steps).toHaveLength(0);
        });

        it("should handle SHA-pinned actions", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af
        with:
          node-version-file: '.nvmrc'
`;
            const workflowPath = join(testDir, "workflow.yml");
            await writeFile(workflowPath, workflowContent);

            // Act
            const steps = await parseWorkflowSetupSteps(workflowPath);

            // Assert
            expect(steps).toHaveLength(1);
            expect(steps[0].action).toBe("actions/setup-node");
        });
    });

    describe("parseAllWorkflowSetupSteps", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(join(testDir, ".github", "workflows"), {
                recursive: true,
            });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should parse setup steps from multiple workflow files", async () => {
            // Arrange
            const ciWorkflow = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
`;
            const testWorkflow = `
name: Test
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-python@v5
`;
            await writeFile(
                join(testDir, ".github", "workflows", "ci.yml"),
                ciWorkflow,
            );
            await writeFile(
                join(testDir, ".github", "workflows", "test.yml"),
                testWorkflow,
            );

            // Act
            const steps = await parseAllWorkflowSetupSteps(testDir);

            // Assert
            expect(steps).toHaveLength(2);
            expect(steps.map((s) => s.action)).toContain("actions/setup-node");
            expect(steps.map((s) => s.action)).toContain(
                "actions/setup-python",
            );
        });

        it("should deduplicate setup steps across workflows", async () => {
            // Arrange
            const ci1 = `
name: CI1
on: push
jobs:
  build:
    steps:
      - uses: actions/setup-node@v4
`;
            const ci2 = `
name: CI2
on: push
jobs:
  build:
    steps:
      - uses: actions/setup-node@v4
`;
            await writeFile(
                join(testDir, ".github", "workflows", "ci1.yml"),
                ci1,
            );
            await writeFile(
                join(testDir, ".github", "workflows", "ci2.yml"),
                ci2,
            );

            // Act
            const steps = await parseAllWorkflowSetupSteps(testDir);

            // Assert
            expect(steps).toHaveLength(1);
            expect(steps[0].action).toBe("actions/setup-node");
        });

        it("should skip copilot-setup-steps workflow when scanning", async () => {
            // Arrange
            const copilotWorkflow = `
name: Copilot Setup Steps
on: push
jobs:
  setup:
    steps:
      - uses: actions/setup-node@v4
`;
            await writeFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                copilotWorkflow,
            );

            // Act
            const steps = await parseAllWorkflowSetupSteps(testDir);

            // Assert
            expect(steps).toHaveLength(0);
        });

        it("should return empty array when workflows directory does not exist", async () => {
            // Arrange
            const emptyDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(emptyDir, { recursive: true });

            try {
                // Act
                const steps = await parseAllWorkflowSetupSteps(emptyDir);

                // Assert
                expect(steps).toHaveLength(0);
            } finally {
                await rm(emptyDir, { recursive: true, force: true });
            }
        });
    });

    describe("checkExistingCopilotWorkflow", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(join(testDir, ".github", "workflows"), {
                recursive: true,
            });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should detect existing copilot-setup-steps.yml workflow", async () => {
            // Arrange
            const workflowContent = `
name: Copilot Setup Steps
on: push
jobs:
  setup:
    steps:
      - uses: actions/setup-node@v4
`;
            await writeFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                workflowContent,
            );

            // Act
            const result = await checkExistingCopilotWorkflow(testDir);

            // Assert
            expect(result.exists).toBe(true);
            expect(result.path).toBe(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
            );
            expect(result.steps).toHaveLength(1);
        });

        it("should detect existing copilot-setup-steps.yaml workflow", async () => {
            // Arrange
            const workflowContent = `
name: Copilot Setup Steps
on: push
jobs:
  setup:
    steps:
      - uses: actions/setup-python@v5
`;
            await writeFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yaml",
                ),
                workflowContent,
            );

            // Act
            const result = await checkExistingCopilotWorkflow(testDir);

            // Assert
            expect(result.exists).toBe(true);
            expect(result.steps).toHaveLength(1);
            expect(result.steps[0].action).toBe("actions/setup-python");
        });

        it("should return exists=false when no copilot workflow found", async () => {
            // Arrange - workflows directory exists but no copilot workflow

            // Act
            const result = await checkExistingCopilotWorkflow(testDir);

            // Assert
            expect(result.exists).toBe(false);
            expect(result.path).toBeUndefined();
            expect(result.steps).toHaveLength(0);
        });
    });

    describe("analyzeCopilotWorkflowNeeds", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(join(testDir, ".github", "workflows"), {
                recursive: true,
            });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should return complete analysis of repository", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");
            const ciWorkflow = `
name: CI
on: push
jobs:
  build:
    steps:
      - uses: actions/setup-python@v5
`;
            await writeFile(
                join(testDir, ".github", "workflows", "ci.yml"),
                ciWorkflow,
            );

            // Act
            const analysis = await analyzeCopilotWorkflowNeeds(testDir);

            // Assert
            expect(analysis.versionFileCandidates).toHaveLength(1);
            expect(analysis.versionFileCandidates[0].runtime).toBe("node");
            expect(analysis.workflowSetupSteps).toHaveLength(1);
            expect(analysis.workflowSetupSteps[0].action).toBe(
                "actions/setup-python",
            );
            expect(analysis.existingCopilotWorkflow).toBe(false);
        });

        it("should detect existing copilot workflow in analysis", async () => {
            // Arrange
            const copilotWorkflow = `
name: Copilot Setup Steps
on: push
jobs:
  setup:
    steps:
      - uses: actions/setup-node@v4
`;
            await writeFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                copilotWorkflow,
            );

            // Act
            const analysis = await analyzeCopilotWorkflowNeeds(testDir);

            // Assert
            expect(analysis.existingCopilotWorkflow).toBe(true);
            expect(analysis.existingCopilotWorkflowSteps).toHaveLength(1);
        });
    });

    describe("getPinnedActionReference", () => {
        it("should return pinned action with SHA and version comment for known actions", () => {
            // Arrange
            const action = "actions/setup-node";

            // Act
            const result = getPinnedActionReference(action);

            // Assert
            expect(result).toContain(action);
            expect(result).toContain(PINNED_ACTIONS[action].sha);
            expect(result).toContain(PINNED_ACTIONS[action].version);
        });

        it("should return action name as-is for unknown actions", () => {
            // Arrange
            const action = "unknown/action";

            // Act
            const result = getPinnedActionReference(action);

            // Assert
            expect(result).toBe(action);
        });
    });

    describe("determineMissingSetupSteps", () => {
        it("should identify missing steps from version files", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [
                    {
                        file: ".nvmrc",
                        runtime: "node",
                        setupAction: "actions/setup-node",
                        version: "20.10.0",
                    },
                ],
                workflowSetupSteps: [],
                existingCopilotWorkflow: true,
                existingCopilotWorkflowSteps: [],
            };

            // Act
            const missing = determineMissingSetupSteps(analysis);

            // Assert
            expect(missing).toHaveLength(1);
            expect(missing[0].action).toBe("actions/setup-node");
        });

        it("should not include steps already in existing copilot workflow", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [
                    {
                        file: ".nvmrc",
                        runtime: "node",
                        setupAction: "actions/setup-node",
                        version: "20.10.0",
                    },
                ],
                workflowSetupSteps: [],
                existingCopilotWorkflow: true,
                existingCopilotWorkflowSteps: [
                    { action: "actions/setup-node" },
                ],
            };

            // Act
            const missing = determineMissingSetupSteps(analysis);

            // Assert
            expect(missing).toHaveLength(0);
        });

        it("should include steps from other workflows that are missing", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [],
                workflowSetupSteps: [{ action: "actions/setup-python" }],
                existingCopilotWorkflow: true,
                existingCopilotWorkflowSteps: [],
            };

            // Act
            const missing = determineMissingSetupSteps(analysis);

            // Assert
            expect(missing).toHaveLength(1);
            expect(missing[0].action).toBe("actions/setup-python");
        });

        it("should deduplicate steps from version files and workflows", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [
                    {
                        file: ".nvmrc",
                        runtime: "node",
                        setupAction: "actions/setup-node",
                        version: "20.10.0",
                    },
                ],
                workflowSetupSteps: [{ action: "actions/setup-node" }],
                existingCopilotWorkflow: true,
                existingCopilotWorkflowSteps: [],
            };

            // Act
            const missing = determineMissingSetupSteps(analysis);

            // Assert
            expect(missing).toHaveLength(1);
        });
    });

    describe("generateCopilotWorkflowContent", () => {
        it("should generate valid YAML workflow content", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [
                    {
                        file: ".nvmrc",
                        runtime: "node",
                        setupAction: "actions/setup-node",
                        version: "20.10.0",
                    },
                ],
                workflowSetupSteps: [],
                existingCopilotWorkflow: false,
                existingCopilotWorkflowSteps: [],
            };

            // Act
            const content = generateCopilotWorkflowContent(analysis);

            // Assert
            expect(content).toContain('name: "Copilot Setup Steps"');
            expect(content).toContain("workflow_dispatch:");
            expect(content).toContain("copilot-setup-steps:");
            expect(content).toContain("runs-on: ubuntu-latest");
        });

        it("should include checkout step", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [],
                workflowSetupSteps: [],
                existingCopilotWorkflow: false,
                existingCopilotWorkflowSteps: [],
            };

            // Act
            const content = generateCopilotWorkflowContent(analysis);

            // Assert
            expect(content).toContain("Checkout code");
            expect(content).toContain("actions/checkout@");
        });

        it("should include setup-node step when .nvmrc is detected", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [
                    {
                        file: ".nvmrc",
                        runtime: "node",
                        setupAction: "actions/setup-node",
                        version: "20.10.0",
                    },
                ],
                workflowSetupSteps: [],
                existingCopilotWorkflow: false,
                existingCopilotWorkflowSteps: [],
            };

            // Act
            const content = generateCopilotWorkflowContent(analysis);

            // Assert
            expect(content).toContain("Setup Node.js");
            expect(content).toContain("actions/setup-node@");
            expect(content).toContain("node-version-file: '.nvmrc'");
        });

        it("should include mise-action with github_token when mise.toml is detected", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [
                    {
                        file: "mise.toml",
                        runtime: "mise",
                        setupAction: "jdx/mise-action",
                    },
                ],
                workflowSetupSteps: [],
                existingCopilotWorkflow: false,
                existingCopilotWorkflowSteps: [],
            };

            // Act
            const content = generateCopilotWorkflowContent(analysis);

            // Assert
            expect(content).toContain("Setup mise");
            expect(content).toContain("jdx/mise-action@");
            expect(content).toContain("github_token: $" + "{{ github.token }}");
        });

        it("should include verification step with version commands", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [
                    {
                        file: ".nvmrc",
                        runtime: "node",
                        setupAction: "actions/setup-node",
                        version: "20.10.0",
                    },
                ],
                workflowSetupSteps: [],
                existingCopilotWorkflow: false,
                existingCopilotWorkflowSteps: [],
            };

            // Act
            const content = generateCopilotWorkflowContent(analysis);

            // Assert
            expect(content).toContain("Verify development environment");
            expect(content).toContain("node --version");
        });

        it("should use pinned action versions with SHA and version comment", () => {
            // Arrange
            const analysis = {
                versionFileCandidates: [
                    {
                        file: ".nvmrc",
                        runtime: "node",
                        setupAction: "actions/setup-node",
                        version: "20.10.0",
                    },
                ],
                workflowSetupSteps: [],
                existingCopilotWorkflow: false,
                existingCopilotWorkflowSteps: [],
            };

            // Act
            const content = generateCopilotWorkflowContent(analysis);

            // Assert
            expect(content).toContain(PINNED_ACTIONS["actions/checkout"].sha);
            expect(content).toContain(PINNED_ACTIONS["actions/setup-node"].sha);
        });
    });
});
