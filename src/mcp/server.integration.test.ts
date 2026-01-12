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
});
