/**
 * Integration tests for the MCP server using the dist build.
 *
 * These tests verify the MCP server works correctly when started via npx
 * as a user would in their VS Code mcp.json configuration.
 *
 * NOTE: These tests require the project to be built first (`npm run build`).
 * They will be skipped if the dist/mcp-server.js file doesn't exist.
 */

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { McpTestClient } from "../lib/mcp-test-client.js";

const chance = new Chance();

// Check if dist file exists - skip tests if not built
const distExists = existsSync(join(process.cwd(), "dist", "mcp-server.js"));

describe.skipIf(!distExists)("MCP Server Integration Tests", () => {
    let client: McpTestClient;
    let testDir: string;

    beforeAll(async () => {
        // Create a test directory with sample files
        testDir = join(tmpdir(), `mcp-integration-${chance.guid()}`);
        const workflowsDir = join(testDir, ".github", "workflows");
        await mkdir(workflowsDir, { recursive: true });

        // Create a sample .nvmrc file
        await writeFile(join(testDir, ".nvmrc"), "20.0.0");

        // Create a sample workflow
        await writeFile(
            join(workflowsDir, "ci.yml"),
            `name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`,
        );

        // Start the MCP client
        client = new McpTestClient();
        await client.start();
    });

    afterAll(async () => {
        client.stop();
        await rm(testDir, { recursive: true, force: true });
    });

    describe("Server Initialization", () => {
        it("should respond to initialize request", async () => {
            const response = await client.initialize();
            expect(response).toBeDefined();
            expect(response).toHaveProperty("serverInfo");
        });
    });

    describe("Tool Listing", () => {
        it("should list all available tools", async () => {
            await client.initialize();
            const response = (await client.listTools()) as {
                tools: Array<{ name: string }>;
            };

            expect(response).toBeDefined();
            expect(response.tools).toBeDefined();
            expect(Array.isArray(response.tools)).toBe(true);

            const toolNames = response.tools.map((t) => t.name);
            expect(toolNames).toContain("discover_environment");
            expect(toolNames).toContain("discover_workflow_setup_actions");
            expect(toolNames).toContain("read_copilot_setup_workflow");
            expect(toolNames).toContain("create_copilot_setup_workflow");
            expect(toolNames).toContain("analyze_action_versions");
            expect(toolNames).toContain("resolve_action_versions");
        });
    });

    describe("Tool Execution", () => {
        it("should execute discover_environment tool", async () => {
            await client.initialize();
            const response = (await client.callTool("discover_environment", {
                targetDir: testDir,
            })) as { content: Array<{ text: string }> };

            expect(response).toBeDefined();
            expect(response.content).toBeDefined();
            expect(response.content.length).toBeGreaterThan(0);

            const result = JSON.parse(response.content[0].text) as Record<
                string,
                unknown
            >;
            expect(result.success).toBe(true);
            expect(result.versionFiles).toBeDefined();
        });

        it("should execute analyze_action_versions tool", async () => {
            await client.initialize();
            const response = (await client.callTool("analyze_action_versions", {
                targetDir: testDir,
            })) as { content: Array<{ text: string }> };

            expect(response).toBeDefined();
            expect(response.content).toBeDefined();

            const result = JSON.parse(response.content[0].text) as Record<
                string,
                unknown
            >;
            expect(result.success).toBe(true);
            expect(result.workflows).toBeDefined();
        });
    });

    describe("Version Resolution", () => {
        it("should execute resolve_action_versions tool and return actions to resolve", async () => {
            await client.initialize();
            const response = (await client.callTool(
                "resolve_action_versions",
                {},
            )) as { content: Array<{ text: string }> };

            expect(response).toBeDefined();
            expect(response.content).toBeDefined();
            expect(response.content.length).toBeGreaterThan(0);

            const result = JSON.parse(response.content[0].text) as Record<
                string,
                unknown
            >;
            expect(result.success).toBe(true);
            expect(result.actionsToResolve).toBeDefined();
            expect(Array.isArray(result.actionsToResolve)).toBe(true);
        });

        it("should resolve specific actions when provided", async () => {
            await client.initialize();
            const response = (await client.callTool("resolve_action_versions", {
                actions: ["actions/setup-node", "actions/setup-python"],
            })) as { content: Array<{ text: string }> };

            expect(response).toBeDefined();
            const result = JSON.parse(response.content[0].text) as Record<
                string,
                unknown
            >;
            expect(result.success).toBe(true);

            const actionsToResolve = result.actionsToResolve as Array<{
                action: string;
                lookupUrl: string;
            }>;
            expect(actionsToResolve.length).toBe(2);
            const actionNames = actionsToResolve.map((a) => a.action);
            expect(actionNames).toContain("actions/setup-node");
            expect(actionNames).toContain("actions/setup-python");
        });

        it("should include lookup URLs for each action to resolve", async () => {
            await client.initialize();
            const response = (await client.callTool("resolve_action_versions", {
                actions: ["actions/checkout"],
            })) as { content: Array<{ text: string }> };

            const result = JSON.parse(response.content[0].text) as Record<
                string,
                unknown
            >;
            const actionsToResolve = result.actionsToResolve as Array<{
                action: string;
                lookupUrl: string;
                currentPlaceholder: string;
            }>;

            expect(actionsToResolve.length).toBe(1);
            expect(actionsToResolve[0].action).toBe("actions/checkout");
            expect(actionsToResolve[0].lookupUrl).toBe(
                "https://github.com/actions/checkout/releases/latest",
            );
            expect(actionsToResolve[0].currentPlaceholder).toBe(
                "RESOLVE_VERSION",
            );
        });

        it("should filter out already resolved actions", async () => {
            await client.initialize();
            const response = (await client.callTool("resolve_action_versions", {
                actions: ["actions/checkout", "actions/setup-node"],
                resolvedVersions: [
                    {
                        action: "actions/checkout",
                        sha: "abc123def456",
                        versionTag: "v4.0.0",
                    },
                ],
            })) as { content: Array<{ text: string }> };

            const result = JSON.parse(response.content[0].text) as Record<
                string,
                unknown
            >;
            const actionsToResolve = result.actionsToResolve as Array<{
                action: string;
            }>;

            expect(actionsToResolve.length).toBe(1);
            expect(actionsToResolve[0].action).toBe("actions/setup-node");
        });

        it("should create workflow with SHA-pinned actions when resolved versions provided", async () => {
            await client.initialize();
            const response = (await client.callTool(
                "create_copilot_setup_workflow",
                {
                    targetDir: testDir,
                    resolvedVersions: [
                        {
                            action: "actions/checkout",
                            sha: "692973e3d937129bcbf40652eb9f2f61becf3332",
                            versionTag: "v4.2.2",
                        },
                        {
                            action: "actions/setup-node",
                            sha: "1e60f620b9541d16bece96c5465dc8ee9832be0b",
                            versionTag: "v4.0.4",
                        },
                    ],
                },
            )) as { content: Array<{ text: string }> };

            const result = JSON.parse(response.content[0].text) as Record<
                string,
                unknown
            >;
            expect(result.success).toBe(true);

            // Check that workflow template contains SHA-pinned actions
            const workflowTemplate = result.workflowTemplate as string;
            expect(workflowTemplate).toContain(
                "692973e3d937129bcbf40652eb9f2f61becf3332",
            );
            expect(workflowTemplate).toContain("# v4.2.2");
        });
    });
});
