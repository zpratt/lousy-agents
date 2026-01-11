import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    isSetupAction,
    parseActionReference,
    parseWorkflows,
    parseWorkflowsFromRoot,
} from "./workflow-parser.js";

const chance = new Chance();

describe("Workflow parser", () => {
    describe("parseActionReference", () => {
        it("should parse action with version tag", () => {
            // Arrange
            const uses = "actions/setup-node@v4";

            // Act
            const result = parseActionReference(uses);

            // Assert
            expect(result.action).toBe("actions/setup-node");
            expect(result.version).toBe("v4");
        });

        it("should parse action with commit SHA", () => {
            // Arrange
            const sha = "b4ffde65f46336ab88eb53be808477a3936bae11";
            const uses = `actions/checkout@${sha}`;

            // Act
            const result = parseActionReference(uses);

            // Assert
            expect(result.action).toBe("actions/checkout");
            expect(result.version).toBe(sha);
        });

        it("should parse action without version", () => {
            // Arrange
            const uses = "actions/setup-node";

            // Act
            const result = parseActionReference(uses);

            // Assert
            expect(result.action).toBe("actions/setup-node");
            expect(result.version).toBeUndefined();
        });
    });

    describe("isSetupAction", () => {
        it("should return true for actions/setup-node", () => {
            // Assert
            expect(isSetupAction("actions/setup-node@v4")).toBe(true);
            expect(isSetupAction("actions/setup-node")).toBe(true);
        });

        it("should return true for actions/setup-python", () => {
            // Assert
            expect(isSetupAction("actions/setup-python@v5")).toBe(true);
        });

        it("should return true for actions/setup-java", () => {
            // Assert
            expect(isSetupAction("actions/setup-java@v4")).toBe(true);
        });

        it("should return true for actions/setup-go", () => {
            // Assert
            expect(isSetupAction("actions/setup-go@v5")).toBe(true);
        });

        it("should return true for actions/setup-ruby", () => {
            // Assert
            expect(isSetupAction("actions/setup-ruby@v1")).toBe(true);
        });

        it("should return true for jdx/mise-action", () => {
            // Assert
            expect(isSetupAction("jdx/mise-action@v2")).toBe(true);
            expect(isSetupAction("jdx/mise-action")).toBe(true);
        });

        it("should return false for actions/checkout", () => {
            // Assert
            expect(isSetupAction("actions/checkout@v4")).toBe(false);
        });

        it("should return false for random actions", () => {
            // Assert
            expect(isSetupAction("some-org/some-action@v1")).toBe(false);
        });
    });

    describe("parseWorkflows", () => {
        let testDir: string;
        let workflowsDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-workflows-${chance.guid()}`);
            workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should extract setup-node action from workflow", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
      - run: npm test
`;
            await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            expect(result).toContainEqual({
                action: "actions/setup-node",
                version: "v4",
                config: { "node-version-file": ".nvmrc" },
                source: "workflow",
            });
        });

        it("should extract setup-python action from workflow", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version-file: '.python-version'
      - run: pytest
`;
            await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            expect(result).toContainEqual({
                action: "actions/setup-python",
                version: "v5",
                config: { "python-version-file": ".python-version" },
                source: "workflow",
            });
        });

        it("should extract jdx/mise-action from workflow", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jdx/mise-action@v2
      - run: mise run test
`;
            await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            expect(result).toContainEqual({
                action: "jdx/mise-action",
                version: "v2",
                config: undefined,
                source: "workflow",
            });
        });

        it("should extract setup actions from multiple workflows", async () => {
            // Arrange
            const ciWorkflow = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
`;
            const deployWorkflow = `
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-python@v5
`;
            await writeFile(join(workflowsDir, "ci.yml"), ciWorkflow);
            await writeFile(join(workflowsDir, "deploy.yaml"), deployWorkflow);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            expect(result).toHaveLength(2);
            expect(result.map((r) => r.action)).toContain("actions/setup-node");
            expect(result.map((r) => r.action)).toContain(
                "actions/setup-python",
            );
        });

        it("should deduplicate same action from multiple workflows", async () => {
            // Arrange
            const ci1Workflow = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
`;
            const ci2Workflow = `
name: CI2
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
`;
            await writeFile(join(workflowsDir, "ci.yml"), ci1Workflow);
            await writeFile(join(workflowsDir, "ci2.yml"), ci2Workflow);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            const nodeActions = result.filter(
                (r) => r.action === "actions/setup-node",
            );
            expect(nodeActions).toHaveLength(1);
        });

        it("should return empty array when workflows directory does not exist", async () => {
            // Arrange
            const nonExistentDir = join(testDir, "non-existent");

            // Act
            const result = await parseWorkflows(nonExistentDir);

            // Assert
            expect(result).toEqual([]);
        });

        it("should return empty array when no setup actions in workflow", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello"
`;
            await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            expect(result).toEqual([]);
        });

        it("should skip malformed YAML files", async () => {
            // Arrange
            const validWorkflow = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
`;
            const malformedYaml = `
name: Bad
on: [push
jobs:
  test:
    - this: is: not: valid
`;
            await writeFile(join(workflowsDir, "ci.yml"), validWorkflow);
            await writeFile(join(workflowsDir, "bad.yml"), malformedYaml);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].action).toBe("actions/setup-node");
        });

        it("should handle workflow with no jobs", async () => {
            // Arrange
            const workflowContent = `
name: Empty
on: [push]
`;
            await writeFile(join(workflowsDir, "empty.yml"), workflowContent);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            expect(result).toEqual([]);
        });

        it("should handle job with no steps", async () => {
            // Arrange
            const workflowContent = `
name: NoSteps
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
`;
            await writeFile(join(workflowsDir, "nosteps.yml"), workflowContent);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            expect(result).toEqual([]);
        });

        it("should extract action with commit SHA version", async () => {
            // Arrange
            const sha = "60a0d83bf581b792aa7057695fe3246d4474d130";
            const workflowContent = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@${sha}
`;
            await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

            // Act
            const result = await parseWorkflows(workflowsDir);

            // Assert
            expect(result).toContainEqual({
                action: "actions/setup-node",
                version: sha,
                config: undefined,
                source: "workflow",
            });
        });
    });

    describe("parseWorkflowsFromRoot", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-root-${chance.guid()}`);
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should parse workflows from .github/workflows in root directory", async () => {
            // Arrange
            const workflowContent = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: jdx/mise-action@v2
`;
            const workflowsDir = join(testDir, ".github", "workflows");
            await writeFile(join(workflowsDir, "ci.yml"), workflowContent);

            // Act
            const result = await parseWorkflowsFromRoot(testDir);

            // Assert
            expect(result).toContainEqual({
                action: "jdx/mise-action",
                version: "v2",
                config: undefined,
                source: "workflow",
            });
        });
    });
});
