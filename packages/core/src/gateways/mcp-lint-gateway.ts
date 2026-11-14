/**
 * Gateway for MCP server config file system operations.
 * Discovers MCP server config files at the shared MCP_CONFIG_SOURCES paths.
 */

import { join } from "node:path";
import { MCP_CONFIG_SOURCES } from "../entities/mcp-config-source.js";
import type { DiscoveredMcpConfigFile } from "../entities/mcp-server.js";
import type { McpServersLintGateway } from "../use-cases/lint-mcp-servers.js";
import { discoverExactRegularFiles } from "./agentic-artifact-discovery.js";
import { readFileNoFollow } from "./file-system-utils.js";

/** Maximum MCP config file size: 1 MB */
const MAX_MCP_CONFIG_FILE_BYTES = 1_048_576;

/**
 * File system implementation of the MCP server lint gateway.
 */
export class FileSystemMcpServersLintGateway implements McpServersLintGateway {
    async discoverMcpConfigFiles(
        targetDir: string,
    ): Promise<DiscoveredMcpConfigFile[]> {
        const discovered: DiscoveredMcpConfigFile[] = [];
        const posixPaths = MCP_CONFIG_SOURCES.map((source) => source.relPath);
        const present = await discoverExactRegularFiles(targetDir, posixPaths);

        for (const relativePath of present) {
            discovered.push({
                filePath: join(targetDir, ...relativePath.split("/")),
                relativePath: join(...relativePath.split("/")),
            });
        }

        return discovered;
    }

    async readFileContent(filePath: string): Promise<string> {
        return readFileNoFollow(filePath, MAX_MCP_CONFIG_FILE_BYTES);
    }
}

/**
 * Creates and returns the default MCP server lint gateway.
 */
export function createMcpServersLintGateway(): McpServersLintGateway {
    return new FileSystemMcpServersLintGateway();
}
