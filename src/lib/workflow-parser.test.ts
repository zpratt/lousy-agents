import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    copilotSetupWorkflowExists,
    parseWorkflowsForSetupActions,
    readCopilotSetupWorkflow,
} from "./workflow-parser.js";

const chance = new Chance();

describe("Workflow Parser", () => {
    let testDir: string;
    let workflowsDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-workflow-${chance.guid()}`);
        workflowsDir = join(testDir, ".github", "workflows");
        await mkdir(workflowsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("parseWorkflowsForSetupActions", () => {
        describe("when parsing workflows with setup actions", () => {
            it("should detect actions/setup-node in a workflow", async () => {
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
          node-version-file: .nvmrc
`;
                await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        action: "actions/setup-node",
                        version: "v4",
                        source: "workflow",
                    }),
                );
            });

            it("should detect actions/setup-python in a workflow", async () => {
                // Arrange
                const workflowContent = `
name: Python CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
`;
                await writeFile(
                    join(workflowsDir, "python.yml"),
                    workflowContent,
                );

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        action: "actions/setup-python",
                        version: "v5",
                        source: "workflow",
                    }),
                );
            });

            it("should detect jdx/mise-action in a workflow", async () => {
                // Arrange
                const workflowContent = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: jdx/mise-action@v2
`;
                await writeFile(
                    join(workflowsDir, "mise.yml"),
                    workflowContent,
                );

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        action: "jdx/mise-action",
                        version: "v2",
                        source: "workflow",
                    }),
                );
            });

            it("should extract action version from commit SHA", async () => {
                // Arrange
                const commitSha = "abc123def456";
                const workflowContent = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@${commitSha}
`;
                await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        action: "actions/setup-node",
                        version: commitSha,
                    }),
                );
            });

            it("should preserve configuration parameters from with block", async () => {
                // Arrange
                const workflowContent = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
`;
                await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                const nodeSetup = result.find(
                    (c) => c.action === "actions/setup-node",
                );
                expect(nodeSetup?.config).toEqual({
                    "node-version-file": ".nvmrc",
                    cache: "npm",
                });
            });
        });

        describe("when parsing multiple workflows", () => {
            it("should deduplicate setup actions across workflows", async () => {
                // Arrange
                const workflow1 = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
`;
                const workflow2 = `
name: Release
on: release
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
`;
                await writeFile(join(workflowsDir, "ci.yml"), workflow1);
                await writeFile(join(workflowsDir, "release.yml"), workflow2);

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                const nodeSetups = result.filter(
                    (c) => c.action === "actions/setup-node",
                );
                expect(nodeSetups).toHaveLength(1);
            });

            it("should detect different setup actions from multiple workflows", async () => {
                // Arrange
                const nodeWorkflow = `
name: Node CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
`;
                const pythonWorkflow = `
name: Python CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-python@v5
`;
                await writeFile(join(workflowsDir, "node.yml"), nodeWorkflow);
                await writeFile(
                    join(workflowsDir, "python.yml"),
                    pythonWorkflow,
                );

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toHaveLength(2);
                expect(result.map((c) => c.action)).toContain(
                    "actions/setup-node",
                );
                expect(result.map((c) => c.action)).toContain(
                    "actions/setup-python",
                );
            });
        });

        describe("when no workflows exist", () => {
            it("should return empty array when workflows directory does not exist", async () => {
                // Arrange
                const emptyDir = join(tmpdir(), `empty-${chance.guid()}`);
                await mkdir(emptyDir, { recursive: true });

                try {
                    // Act
                    const result =
                        await parseWorkflowsForSetupActions(emptyDir);

                    // Assert
                    expect(result).toHaveLength(0);
                } finally {
                    await rm(emptyDir, { recursive: true, force: true });
                }
            });

            it("should return empty array when workflows directory is empty", async () => {
                // Arrange - workflowsDir is already created but empty

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toHaveLength(0);
            });
        });

        describe("when workflow has no setup actions", () => {
            it("should return empty array for workflows without setup actions", async () => {
                // Arrange
                const workflowContent = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;
                await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toHaveLength(0);
            });
        });

        describe("when handling malformed YAML", () => {
            it("should skip malformed YAML files gracefully", async () => {
                // Arrange
                const malformedYaml = `
name: CI
on: push
jobs:
  build:
    - this is: [not valid yaml
`;
                const validYaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
`;
                await writeFile(
                    join(workflowsDir, "malformed.yml"),
                    malformedYaml,
                );
                await writeFile(join(workflowsDir, "valid.yml"), validYaml);

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].action).toBe("actions/setup-node");
            });
        });

        describe("when detecting additional setup actions", () => {
            it("should detect actions/setup-java", async () => {
                // Arrange
                const workflowContent = `
name: Java CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-java@v4
        with:
          java-version: "21"
`;
                await writeFile(
                    join(workflowsDir, "java.yml"),
                    workflowContent,
                );

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        action: "actions/setup-java",
                    }),
                );
            });

            it("should detect actions/setup-go", async () => {
                // Arrange
                const workflowContent = `
name: Go CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-go@v5
`;
                await writeFile(join(workflowsDir, "go.yml"), workflowContent);

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        action: "actions/setup-go",
                    }),
                );
            });

            it("should detect actions/setup-ruby", async () => {
                // Arrange
                const workflowContent = `
name: Ruby CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-ruby@v1
`;
                await writeFile(
                    join(workflowsDir, "ruby.yml"),
                    workflowContent,
                );

                // Act
                const result = await parseWorkflowsForSetupActions(testDir);

                // Assert
                expect(result).toContainEqual(
                    expect.objectContaining({
                        action: "actions/setup-ruby",
                    }),
                );
            });
        });
    });

    describe("copilotSetupWorkflowExists", () => {
        it("should return true when copilot-setup-steps.yml exists", async () => {
            // Arrange
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                "name: Copilot Setup Steps",
            );

            // Act
            const result = await copilotSetupWorkflowExists(testDir);

            // Assert
            expect(result).toBe(true);
        });

        it("should return false when copilot-setup-steps.yml does not exist", async () => {
            // Arrange - workflows dir exists but no copilot file

            // Act
            const result = await copilotSetupWorkflowExists(testDir);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe("readCopilotSetupWorkflow", () => {
        it("should parse and return the copilot-setup-steps.yml workflow", async () => {
            // Arrange
            const workflowContent = `
name: Copilot Setup Steps
on: workflow_dispatch
jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                workflowContent,
            );

            // Act
            const result = await readCopilotSetupWorkflow(testDir);

            // Assert
            expect(result).toMatchObject({
                name: "Copilot Setup Steps",
            });
        });

        it("should return null when copilot-setup-steps.yml does not exist", async () => {
            // Arrange - no copilot file

            // Act
            const result = await readCopilotSetupWorkflow(testDir);

            // Assert
            expect(result).toBeNull();
        });
    });
});
