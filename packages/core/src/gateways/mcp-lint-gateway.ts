/**
 * Gateway for MCP server config file system operations.
 * Discovers MCP server config files at the shared MCP_CONFIG_SOURCES paths.
 */

import { join } from "node:path";
import { MCP_CONFIG_SOURCES } from "../entities/mcp-config-source.js";
import type { DiscoveredMcpConfigFile } from "../entities/mcp-server.js";
import type { McpServersLintGateway } from "../use-cases/lint-mcp-servers.js";
import {
    pathExistsWithinRoot,
    readFileNoFollow,
    resolveSafePath,
} from "./file-system-utils.js";

/** Maximum MCP config file size: 1 MB */
const MAX_MCP_CONFIG_FILE_BYTES = 1_048_576;

/** Catalog MCP config paths converted to OS-native relative paths. */
const MCP_CONFIG_RELATIVE_PATHS = MCP_CONFIG_SOURCES.map((source) =>
    join(...source.relPath.split("/")),
);

const SKIPPABLE_PATH_ERROR_PREFIXES = [
    "Resolved path is outside target directory:",
    "Path contains symbolic link:",
] as const;

function isSkippablePathError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    return SKIPPABLE_PATH_ERROR_PREFIXES.some((prefix) =>
        error.message.startsWith(prefix),
    );
}

async function pathExistsSafely(
    targetDir: string,
    relativePath: string,
): Promise<boolean> {
    try {
        return await pathExistsWithinRoot(targetDir, relativePath);
    } catch {
        return false;
    }
}

async function resolveConfigPathOrNull(
    targetDir: string,
    relativePath: string,
): Promise<string | null> {
    try {
        return await resolveSafePath(targetDir, relativePath);
    } catch (error: unknown) {
        if (isSkippablePathError(error)) {
            return null;
        }
        throw error;
    }
}

/**
 * Resolves a config path within the target directory, returning null when the
 * path is missing or escapes the root via traversal/symlink.
 */
async function tryResolveConfigPath(
    targetDir: string,
    relativePath: string,
): Promise<string | null> {
    if (!(await pathExistsSafely(targetDir, relativePath))) {
        return null;
    }
    return resolveConfigPathOrNull(targetDir, relativePath);
}

/**
 * File system implementation of the MCP server lint gateway.
 */
export class FileSystemMcpServersLintGateway implements McpServersLintGateway {
    async discoverMcpConfigFiles(
        targetDir: string,
    ): Promise<DiscoveredMcpConfigFile[]> {
        const discovered: DiscoveredMcpConfigFile[] = [];

        for (const relativePath of MCP_CONFIG_RELATIVE_PATHS) {
            const safePath = await tryResolveConfigPath(
                targetDir,
                relativePath,
            );
            if (safePath === null) {
                continue;
            }
            discovered.push({ filePath: safePath, relativePath });
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
