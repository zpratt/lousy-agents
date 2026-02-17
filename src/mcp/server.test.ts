import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import type { ActionToResolve } from "../entities/copilot-setup.js";
import {
    analyzeActionVersionsHandler,
    createCopilotSetupWorkflowHandler,
    createMcpServer,
    discoverEnvironmentHandler,
    discoverFeedbackLoopsHandler,
    discoverWorkflowSetupActionsHandler,
    readCopilotSetupWorkflowHandler,
    resolveActionVersionsHandler,
    validateInstructionCoverageHandler,
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

    describe("create_copilot_setup_workflow handler with version resolution", () => {
        it("should return actionsToResolve when creating new workflow", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            const response = await createCopilotSetupWorkflowHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.actionsToResolve).toBeDefined();
            expect(Array.isArray(result.actionsToResolve)).toBe(true);
            const actionsToResolve =
                result.actionsToResolve as ActionToResolve[];
            expect(actionsToResolve.length).toBeGreaterThan(0);

            // Should include checkout and setup-node
            const actionNames = actionsToResolve.map((a) => a.action);
            expect(actionNames).toContain("actions/checkout");
            expect(actionNames).toContain("actions/setup-node");
        });

        it("should include instructions when actionsToResolve is non-empty", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            const response = await createCopilotSetupWorkflowHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.instructions).toBeDefined();
            expect(typeof result.instructions).toBe("string");
            expect(result.instructions).toContain("SHA");
        });

        it("should include workflowTemplate in response", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            const response = await createCopilotSetupWorkflowHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.workflowTemplate).toBeDefined();
            expect(typeof result.workflowTemplate).toBe("string");
            const parsed = parseYaml(result.workflowTemplate as string);
            expect(parsed.name).toBe("Copilot Setup Steps");
        });

        it("should use placeholder versions in workflow template", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            const response = await createCopilotSetupWorkflowHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            const workflowTemplate = result.workflowTemplate as string;
            expect(workflowTemplate).toContain("RESOLVE_VERSION");
        });

        it("should use SHA-pinned versions when resolvedVersions is provided", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");
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
            const response = await createCopilotSetupWorkflowHandler({
                targetDir: testDir,
                resolvedVersions,
            });
            const result = parseResult(response);

            // Assert - YAML comment format: "action@sha # versionTag"
            const workflowTemplate = result.workflowTemplate as string;
            expect(workflowTemplate).toContain("abc123def456 # v4.1.0");
            expect(workflowTemplate).toContain("789xyz012abc # v4.0.2");

            // actionsToResolve should be empty since all are resolved
            const actionsToResolve =
                result.actionsToResolve as ActionToResolve[];
            expect(actionsToResolve.length).toBe(0);
        });
    });

    describe("resolve_action_versions handler", () => {
        it("should return actionsToResolve for default actions", async () => {
            // Act
            const response = await resolveActionVersionsHandler({});
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.actionsToResolve).toBeDefined();
            expect(Array.isArray(result.actionsToResolve)).toBe(true);
            const actionsToResolve =
                result.actionsToResolve as ActionToResolve[];
            expect(actionsToResolve.length).toBeGreaterThan(0);

            // Should include checkout and common setup actions
            const actionNames = actionsToResolve.map((a) => a.action);
            expect(actionNames).toContain("actions/checkout");
            expect(actionNames).toContain("actions/setup-node");
        });

        it("should return lookup URLs for each action", async () => {
            // Act
            const response = await resolveActionVersionsHandler({});
            const result = parseResult(response);

            // Assert
            const actionsToResolve =
                result.actionsToResolve as ActionToResolve[];
            for (const action of actionsToResolve) {
                expect(action.lookupUrl).toContain("https://github.com/");
                expect(action.lookupUrl).toContain("/releases/latest");
                expect(action.currentPlaceholder).toBe("RESOLVE_VERSION");
            }
        });

        it("should return specific actions when provided", async () => {
            // Act
            const response = await resolveActionVersionsHandler({
                actions: ["actions/setup-python", "jdx/mise-action"],
            });
            const result = parseResult(response);

            // Assert
            const actionsToResolve =
                result.actionsToResolve as ActionToResolve[];
            expect(actionsToResolve.length).toBe(2);
            const actionNames = actionsToResolve.map((a) => a.action);
            expect(actionNames).toContain("actions/setup-python");
            expect(actionNames).toContain("jdx/mise-action");
        });

        it("should filter out already-resolved actions", async () => {
            // Arrange
            const resolvedVersions = [
                {
                    action: "actions/checkout",
                    sha: "abc123",
                    versionTag: "v4.0.0",
                },
            ];

            // Act
            const response = await resolveActionVersionsHandler({
                actions: ["actions/checkout", "actions/setup-node"],
                resolvedVersions,
            });
            const result = parseResult(response);

            // Assert
            const actionsToResolve =
                result.actionsToResolve as ActionToResolve[];
            expect(actionsToResolve.length).toBe(1);
            expect(actionsToResolve[0].action).toBe("actions/setup-node");
        });

        it("should include instructions when actionsToResolve is non-empty", async () => {
            // Act
            const response = await resolveActionVersionsHandler({
                actions: ["actions/setup-node"],
            });
            const result = parseResult(response);

            // Assert
            expect(result.instructions).toBeDefined();
            expect(typeof result.instructions).toBe("string");
            expect(result.instructions).toContain("SHA");
        });

        it("should return no instructions when all actions are resolved", async () => {
            // Arrange
            const resolvedVersions = [
                {
                    action: "actions/setup-node",
                    sha: "abc123",
                    versionTag: "v4.0.0",
                },
            ];

            // Act
            const response = await resolveActionVersionsHandler({
                actions: ["actions/setup-node"],
                resolvedVersions,
            });
            const result = parseResult(response);

            // Assert
            expect(result.actionsToResolve).toHaveLength(0);
            expect(result.instructions).toBeUndefined();
            expect(result.message).toContain("All actions have been resolved");
        });
    });

    describe("discover_feedback_loops handler", () => {
        it("should discover scripts from package.json", async () => {
            // Arrange
            const packageJson = {
                name: "test-project",
                scripts: {
                    test: "vitest run",
                    build: "rspack build",
                    lint: "biome check .",
                    dev: "tsx src/index.ts",
                },
            };
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson),
            );

            // Act
            const response = await discoverFeedbackLoopsHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.summary).toBeDefined();
            expect(result.summary).toMatchObject({
                totalScripts: 4,
                mandatoryScripts: 3, // test, build, lint are mandatory
            });
            expect(result.scriptsByPhase).toBeDefined();
            expect(result.scriptsByPhase).toHaveProperty("test");
            expect(result.scriptsByPhase).toHaveProperty("build");
            expect(result.scriptsByPhase).toHaveProperty("lint");
        });

        it("should discover tools from GitHub Actions workflows", async () => {
            // Arrange
            const workflow = {
                name: "CI",
                on: "push",
                jobs: {
                    test: {
                        "runs-on": "ubuntu-latest",
                        steps: [
                            {
                                name: "Test",
                                run: "npm test",
                            },
                            {
                                name: "Build",
                                run: "npm run build",
                            },
                        ],
                    },
                },
            };
            await writeFile(
                join(workflowsDir, "ci.yml"),
                JSON.stringify(workflow),
            );

            // Act
            const response = await discoverFeedbackLoopsHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.summary).toHaveProperty("totalTools");
            expect(result.toolsByPhase).toBeDefined();
        });

        it("should return empty results when no scripts or workflows found", async () => {
            // Act
            const response = await discoverFeedbackLoopsHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.summary?.totalScripts).toBe(0);
            expect(result.summary?.totalTools).toBe(0);
        });
    });

    describe("validate_instruction_coverage handler", () => {
        it("should report 100% coverage when all mandatory scripts are documented", async () => {
            // Arrange
            const packageJson = {
                scripts: {
                    test: "vitest run",
                    build: "rspack build",
                    lint: "biome check .",
                },
            };
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson),
            );

            const instructionsDir = join(testDir, ".github", "instructions");
            await mkdir(instructionsDir, { recursive: true });
            const instructions = `
# Testing

Run tests with:
\`\`\`bash
npm run test
npm run build
npm run lint
\`\`\`
`;
            await writeFile(
                join(instructionsDir, "test.instructions.md"),
                instructions,
            );

            // Act
            const response = await validateInstructionCoverageHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.hasFullCoverage).toBe(true);
            expect(result.summary?.coveragePercentage).toBe(100);
            expect(result.suggestions).toContain(
                "✅ All mandatory feedback loops are documented in instructions",
            );
        });

        it("should report partial coverage when some scripts are missing", async () => {
            // Arrange
            const packageJson = {
                scripts: {
                    test: "vitest run",
                    build: "rspack build",
                    lint: "biome check .",
                },
            };
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson),
            );

            const instructionsDir = join(testDir, ".github", "instructions");
            await mkdir(instructionsDir, { recursive: true });
            const instructions = `
# Testing

Run tests with:
\`\`\`bash
npm run test
\`\`\`
`;
            await writeFile(
                join(instructionsDir, "test.instructions.md"),
                instructions,
            );

            // Act
            const response = await validateInstructionCoverageHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.hasFullCoverage).toBe(false);
            expect(result.summary?.coveragePercentage).toBeLessThan(100);
            expect(result.missing).toBeDefined();
            expect(Array.isArray(result.missing)).toBe(true);
            expect(result.missing?.length).toBeGreaterThan(0);
        });

        it("should provide suggestions for missing documentation", async () => {
            // Arrange
            const packageJson = {
                scripts: {
                    test: "vitest run",
                    build: "rspack build",
                },
            };
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson),
            );

            // Act
            const response = await validateInstructionCoverageHandler({
                targetDir: testDir,
            });
            const result = parseResult(response);

            // Assert
            expect(result.success).toBe(true);
            expect(result.suggestions).toBeDefined();
            expect(Array.isArray(result.suggestions)).toBe(true);
            expect(result.suggestions?.length).toBeGreaterThan(0);

            const suggestionsText = (result.suggestions as string[]).join("\n");
            expect(suggestionsText).toContain("phase:");
            expect(suggestionsText).toContain("Document");
        });
    });
});
