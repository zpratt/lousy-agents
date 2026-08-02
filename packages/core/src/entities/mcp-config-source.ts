/**
 * Canonical list of MCP server configuration file locations.
 * Shared by doctor (inventory enumeration) and lint (mcp-servers target) so
 * the two consumers cannot drift on where MCP servers are declared.
 *
 * Deliberately kept separate from AGENTIC_LOCATION_CATALOG: one MCP config
 * file can declare many servers, so the one-path-to-one-construct model the
 * catalog/matchers use for skills, agents, hooks, and instructions does not
 * fit. This list is the single source of truth for MCP config paths instead.
 */

import type { AgenticHarnessHint } from "./agentic-location-catalog.js";

export interface McpConfigSource {
    readonly relPath: string;
    readonly harnessHint: AgenticHarnessHint;
}

export const MCP_CONFIG_SOURCES: readonly McpConfigSource[] = [
    { relPath: ".mcp.json", harnessHint: "shared" },
    { relPath: ".vscode/mcp.json", harnessHint: "copilot" },
] as const;
