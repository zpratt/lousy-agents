/**
 * Integration tests for the MCP server using the dist build.
 *
 * These tests verify the MCP server works correctly when started via npx
 * as a user would in their VS Code mcp.json configuration.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const chance = new Chance();

/**
 * MCP client for testing.
 * Sends JSON-RPC messages to the MCP server and receives responses.
 */
class McpTestClient {
    private process: ChildProcess | null = null;
    private messageId = 0;
    private responseBuffer = "";
    private pendingResponses: Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
    > = new Map();

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Start the MCP server using the built dist file
            this.process = spawn("node", ["dist/mcp-server.js"], {
                cwd: process.cwd(),
                stdio: ["pipe", "pipe", "pipe"],
            });

            if (!this.process.stdout || !this.process.stdin) {
                reject(new Error("Failed to create process streams"));
                return;
            }

            // Handle stdout data
            this.process.stdout.on("data", (data: Buffer) => {
                this.responseBuffer += data.toString();
                this.processResponses();
            });

            // Handle stderr for debugging
            this.process.stderr?.on("data", (data: Buffer) => {
                // Log errors but don't fail
                console.error("MCP server stderr:", data.toString());
            });

            this.process.on("error", (error) => {
                reject(error);
            });

            // Give the server a moment to start
            setTimeout(resolve, 100);
        });
    }

    private processResponses(): void {
        // Try to parse complete JSON-RPC messages
        const lines = this.responseBuffer.split("\n");
        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (line) {
                try {
                    const response = JSON.parse(line) as {
                        id?: number;
                        result?: unknown;
                        error?: { message: string };
                    };
                    if (response.id !== undefined) {
                        const pending = this.pendingResponses.get(response.id);
                        if (pending) {
                            this.pendingResponses.delete(response.id);
                            if (response.error) {
                                pending.reject(
                                    new Error(response.error.message),
                                );
                            } else {
                                pending.resolve(response.result);
                            }
                        }
                    }
                } catch {
                    // Not a valid JSON line, skip
                }
            }
        }
        // Keep the last incomplete line in the buffer
        this.responseBuffer = lines[lines.length - 1];
    }

    async sendRequest(method: string, params?: unknown): Promise<unknown> {
        if (!this.process?.stdin) {
            throw new Error("MCP server not started");
        }

        const id = ++this.messageId;
        const request = {
            jsonrpc: "2.0",
            id,
            method,
            params: params || {},
        };

        return new Promise((resolve, reject) => {
            this.pendingResponses.set(id, { resolve, reject });

            // Set a timeout
            const timeout = setTimeout(() => {
                this.pendingResponses.delete(id);
                reject(new Error(`Request timeout for ${method}`));
            }, 5000);

            this.process?.stdin?.write(
                `${JSON.stringify(request)}\n`,
                (error) => {
                    if (error) {
                        clearTimeout(timeout);
                        this.pendingResponses.delete(id);
                        reject(error);
                    }
                },
            );
        });
    }

    async initialize(): Promise<unknown> {
        return this.sendRequest("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
        });
    }

    async listTools(): Promise<unknown> {
        return this.sendRequest("tools/list", {});
    }

    async callTool(
        name: string,
        args: Record<string, unknown>,
    ): Promise<unknown> {
        return this.sendRequest("tools/call", { name, arguments: args });
    }

    stop(): void {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}

describe("MCP Server Integration Tests", () => {
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
