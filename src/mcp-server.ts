/**
 * MCP Server entry point for lousy-agents.
 * Starts the MCP server with stdio transport for VS Code integration.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp/server.js";

async function main(): Promise<void> {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
});
