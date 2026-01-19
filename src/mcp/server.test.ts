import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
    analyzeActionVersionsHandler,
    createCopilotSetupWorkflowHandler,
    createMcpServer,
    discoverEnvironmentHandler,
    discoverWorkflowSetupActionsHandler,
    readCopilotSetupWorkflowHandler,
} from "./server.js";

const chance = new Chance();

/**
 * Helper to parse tool result
 */
function parseResult(
    result: Awaited<ReturnType<typeof discoverEnvironmentHandler>>,
): Record<string, unknown> {
    const textContent = result.content.find((c) => c.type === "text");
    if (!textContent) {
        throw new Error("No text content in response");
    }
    return JSON.parse(textContent.text) as Record<string, unknown>;
}

describe("MCP Server", () => {
    let testDir: string;
    let workflowsDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-mcp-server-${chance.guid()}`);
        workflowsDir = join(testDir, ".github", "workflows");
        await mkdir(workflowsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("createMcpServer", () => {
        it("should create an MCP server instance", () => {
            const server = createMcpServer();
            expect(server).toBeDefined();
        });
    });

    describe("discover_environment handler", () => {
        it("should detect mise.toml when present", async () => {
            // Arrange
            await writeFile(join(testDir, "mise.toml"), '[tools]\nnode = "20"');

            // Act
            const response = await discoverEnvironmentHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.hasMise).toBe(true);
            expect(result.message).toContain("mise.toml");
        });

        it("should detect version files when present", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            const response = await discoverEnvironmentHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.hasMise).toBe(false);
            expect(result.versionFiles).toHaveLength(1);
            expect(
                (result.versionFiles as Array<{ filename: string }>)[0]
                    .filename,
            ).toBe(".nvmrc");
        });

        it("should return error for non-existent directory", async () => {
            // Arrange
            const nonExistentDir = join(testDir, "does-not-exist");

            // Act
            const response = await discoverEnvironmentHandler({
                targetDir: nonExistentDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain("does not exist");
        });
    });

    describe("discover_workflow_setup_actions handler", () => {
        it("should detect setup actions in existing workflows", async () => {
            // Arrange
            const ciWorkflow = `
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
            await writeFile(join(workflowsDir, "ci.yml"), ciWorkflow);

            // Act
            const response = await discoverWorkflowSetupActionsHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(
                (result.actions as Array<{ action: string }>).length,
            ).toBeGreaterThan(0);
            expect(
                (result.actions as Array<{ action: string }>).some(
                    (a) => a.action === "actions/setup-node",
                ),
            ).toBe(true);
        });

        it("should return empty list when no workflows directory exists", async () => {
            // Arrange
            const emptyDir = join(tmpdir(), `empty-${chance.guid()}`);
            await mkdir(emptyDir, { recursive: true });

            try {
                // Act
                const response = await discoverWorkflowSetupActionsHandler({
                    targetDir: emptyDir,
                });
                const result = parseResult(response);

                // Assert
                expect(result.success).toBe(true);
                expect(result.actions).toHaveLength(0);
                expect(result.message).toContain(
                    "No .github/workflows directory",
                );
            } finally {
                await rm(emptyDir, { recursive: true, force: true });
            }
        });
    });

    describe("read_copilot_setup_workflow handler", () => {
        it("should return workflow does not exist when missing", async () => {
            // Act
            const response = await readCopilotSetupWorkflowHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.exists).toBe(false);
            expect(result.message).toContain("does not exist");
        });

        it("should return workflow content when exists", async () => {
            // Arrange
            const workflow = `---
name: Copilot Setup Steps
on:
  workflow_dispatch: null
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                workflow,
            );

            // Act
            const response = await readCopilotSetupWorkflowHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.exists).toBe(true);
            expect((result.workflow as { name: string }).name).toBe(
                "Copilot Setup Steps",
            );
            expect(
                (result.workflow as { steps: unknown[] }).steps,
            ).toHaveLength(1);
        });
    });

    describe("create_copilot_setup_workflow handler", () => {
        it("should create new workflow when none exists", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            const response = await createCopilotSetupWorkflowHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.action).toBe("created");
            expect(result.stepsAdded).toContain("actions/setup-node");

            // Verify file was created
            const content = await readFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                "utf-8",
            );
            const parsed = parseYaml(content);
            expect(parsed.name).toBe("Copilot Setup Steps");
        });

        it("should update existing workflow with missing steps", async () => {
            // Arrange
            const existingWorkflow = `---
name: Copilot Setup Steps
on:
  workflow_dispatch: null
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            const response = await createCopilotSetupWorkflowHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.action).toBe("updated");
            expect(result.stepsAdded).toContain("actions/setup-node");
        });

        it("should report no changes needed when workflow is complete", async () => {
            // Arrange
            const completeWorkflow = `---
name: Copilot Setup Steps
on:
  workflow_dispatch: null
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                completeWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            const response = await createCopilotSetupWorkflowHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.action).toBe("no_changes_needed");
            expect(result.stepsAdded).toHaveLength(0);
        });
    });

    describe("analyze_action_versions handler", () => {
        it("should analyze action versions in workflows", async () => {
            // Arrange
            const ciWorkflow = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`;
            await writeFile(join(workflowsDir, "ci.yml"), ciWorkflow);

            // Act
            const response = await analyzeActionVersionsHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.workflows).toHaveLength(1);
            expect((result.workflows as Array<{ file: string }>)[0].file).toBe(
                "ci.yml",
            );
            expect(
                (result.workflows as Array<{ actions: unknown[] }>)[0].actions,
            ).toHaveLength(2);
            expect((result.uniqueActions as unknown[]).length).toBeGreaterThan(
                0,
            );
        });

        it("should return empty when no workflows exist", async () => {
            // Arrange
            const emptyDir = join(tmpdir(), `empty-${chance.guid()}`);
            await mkdir(emptyDir, { recursive: true });

            try {
                // Act
                const response = await analyzeActionVersionsHandler({
                    targetDir: emptyDir,
                });
                const result = parseResult(response);

                // Assert
                expect(result.success).toBe(true);
                expect(result.workflows).toHaveLength(0);
                expect(result.message).toContain(
                    "No .github/workflows directory",
                );
            } finally {
                await rm(emptyDir, { recursive: true, force: true });
            }
        });
    });
});
