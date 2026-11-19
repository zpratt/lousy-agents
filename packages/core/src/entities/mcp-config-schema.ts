/**
 * Baseline shape of an MCP server configuration file. Shared by doctor and
 * lint so the two cannot disagree on what a valid config is.
 */

import { z } from "zod";

/**
 * Zod schema for a single MCP server declaration.
 * Baseline shape only: an object whose optional `type`/`transport` fields,
 * when present, must be non-empty strings. Unknown fields are preserved.
 */
export const McpServerEntrySchema = z
    .object({
        type: z.string().min(1, "type must not be empty").optional(),
        transport: z.string().min(1, "transport must not be empty").optional(),
    })
    .passthrough();

/**
 * Zod schema for the MCP config file shape: `mcpServers` (Claude Code's
 * `.mcp.json` convention) and `servers` (VS Code's `.vscode/mcp.json`
 * convention), each a map of server name to a server declaration.
 */
export const McpConfigSchema = z
    .object({
        mcpServers: z.record(z.string(), McpServerEntrySchema).optional(),
        servers: z.record(z.string(), McpServerEntrySchema).optional(),
    })
    .passthrough();
