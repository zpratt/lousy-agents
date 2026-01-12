/**
 * MCP test client for integration testing.
 *
 * This client communicates with an MCP server process via stdio,
 * sending JSON-RPC messages and receiving responses.
 */

import { type ChildProcess, spawn } from "node:child_process";

/**
 * Time to wait for the MCP server process to start and be ready
 * to accept connections. Allows for process initialization overhead.
 */
const SERVER_STARTUP_DELAY_MS = 100;

/**
 * Maximum time to wait for a response from the MCP server
 * before considering the request timed out.
 */
const REQUEST_TIMEOUT_MS = 5000;

/**
 * MCP client for testing.
 * Sends JSON-RPC messages to the MCP server and receives responses.
 */
export class McpTestClient {
    private process: ChildProcess | null = null;
    private messageId = 0;
    private responseBuffer = "";
    private pendingResponses: Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
    > = new Map();
    private isStarted = false;

    /**
     * Starts the MCP server process.
     */
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
                // Log errors but don't fail - stderr is expected for some operations
                console.error("MCP server stderr:", data.toString());
            });

            this.process.on("error", (error) => {
                reject(error);
            });

            this.process.on("exit", () => {
                this.isStarted = false;
            });

            this.isStarted = true;

            // Give the server a moment to start
            setTimeout(resolve, SERVER_STARTUP_DELAY_MS);
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

    /**
     * Sends a JSON-RPC request to the MCP server.
     */
    async sendRequest(method: string, params?: unknown): Promise<unknown> {
        if (!this.process?.stdin || !this.isStarted) {
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
            }, REQUEST_TIMEOUT_MS);

            // Check if stdin is still writable before writing
            if (!this.process?.stdin?.writable) {
                clearTimeout(timeout);
                this.pendingResponses.delete(id);
                reject(new Error("MCP server stdin is not writable"));
                return;
            }

            this.process.stdin.write(
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

    /**
     * Sends an initialize request to the MCP server.
     */
    async initialize(): Promise<unknown> {
        return this.sendRequest("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
        });
    }

    /**
     * Lists all available tools from the MCP server.
     */
    async listTools(): Promise<unknown> {
        return this.sendRequest("tools/list", {});
    }

    /**
     * Calls a tool on the MCP server.
     */
    async callTool(
        name: string,
        args: Record<string, unknown>,
    ): Promise<unknown> {
        return this.sendRequest("tools/call", { name, arguments: args });
    }

    /**
     * Stops the MCP server process.
     */
    stop(): void {
        if (this.process) {
            this.isStarted = false;
            // Clear pending responses before killing
            for (const [id, pending] of this.pendingResponses) {
                pending.reject(new Error("MCP server stopped"));
                this.pendingResponses.delete(id);
            }
            this.process.kill();
            this.process = null;
        }
    }
}
