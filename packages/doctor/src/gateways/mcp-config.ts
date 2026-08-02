import {
    MCP_CONFIG_SOURCES,
    type McpConfigSource,
} from "@lousy-agents/core/entities/mcp-config-source.js";
import { readTextWithinRoot } from "@lousy-agents/core/gateways/file-system-utils.js";
import { z } from "zod";
import type { HarnessName } from "../entities/edge-types.js";

const MAX_MCP_CONFIG_BYTES = 1_048_576;

export interface McpServerRecord {
    serverName: string;
    transport?: string;
    harness: HarnessName;
    path: string;
}

const McpServerEntrySchema = z
    .object({
        type: z.string().optional(),
        transport: z.string().optional(),
    })
    .passthrough();

/**
 * Property names that must never be used as MCP server names: assigning
 * them via a plain object key (as zod's `record()` does when reconstructing
 * parsed output) triggers JavaScript's `__proto__` magic setter instead of
 * creating an own property, silently dropping the entry. Rejected explicitly
 * so a config declaring one of these names is treated as invalid instead of
 * silently under-inventoried.
 */
const RESERVED_SERVER_NAMES = [
    "__proto__",
    "constructor",
    "prototype",
] as const;

const SERVER_MAP_FIELDS = ["mcpServers", "servers"] as const;

function hasReservedServerName(parsed: unknown): boolean {
    if (typeof parsed !== "object" || parsed === null) {
        return false;
    }
    for (const field of SERVER_MAP_FIELDS) {
        const servers = (parsed as Record<string, unknown>)[field];
        if (typeof servers !== "object" || servers === null) {
            continue;
        }
        if (
            RESERVED_SERVER_NAMES.some((name) => Object.hasOwn(servers, name))
        ) {
            return true;
        }
    }
    return false;
}

// Accepts both Claude Code's `.mcp.json` convention (`mcpServers`) and VS
// Code's `.vscode/mcp.json` convention (`servers`) regardless of which
// source file is being read, since either config file could in practice
// use either key.
const McpConfigSchema = z
    .object({
        mcpServers: z.record(z.string(), McpServerEntrySchema).optional(),
        servers: z.record(z.string(), McpServerEntrySchema).optional(),
    })
    .passthrough();

async function readMcpServersFromSource(
    repoRoot: string,
    source: McpConfigSource,
): Promise<McpServerRecord[]> {
    let content: string;
    try {
        content = await readTextWithinRoot(
            repoRoot,
            source.relPath,
            MAX_MCP_CONFIG_BYTES,
        );
    } catch {
        return [];
    }

    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return [];
    }

    if (hasReservedServerName(raw)) {
        return [];
    }

    const result = McpConfigSchema.safeParse(raw);
    if (!result.success) {
        return [];
    }

    const servers = {
        ...(result.data.mcpServers ?? {}),
        ...(result.data.servers ?? {}),
    };

    return Object.entries(servers).map(
        ([serverName, entry]): McpServerRecord => ({
            serverName,
            harness: source.harnessHint,
            path: source.relPath,
            ...(entry.transport !== undefined
                ? { transport: entry.transport }
                : entry.type !== undefined
                  ? { transport: entry.type }
                  : {}),
        }),
    );
}

export async function enumerateMcpServers(
    repoRoot: string,
): Promise<McpServerRecord[]> {
    const records: McpServerRecord[] = [];
    for (const source of MCP_CONFIG_SOURCES) {
        records.push(...(await readMcpServersFromSource(repoRoot, source)));
    }
    return records;
}
