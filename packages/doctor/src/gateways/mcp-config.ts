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

interface McpConfigSource {
    relPath: string;
    harness: HarnessName;
}

const MCP_CONFIG_SOURCES: readonly McpConfigSource[] = [
    { relPath: ".mcp.json", harness: "claude" },
    { relPath: ".vscode/mcp.json", harness: "copilot" },
];

const McpServerEntrySchema = z
    .object({
        type: z.string().optional(),
        transport: z.string().optional(),
    })
    .passthrough();

const McpConfigSchema = z
    .object({
        mcpServers: z.record(z.string(), McpServerEntrySchema).optional(),
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

    const result = McpConfigSchema.safeParse(raw);
    if (!result.success || result.data.mcpServers === undefined) {
        return [];
    }

    return Object.entries(result.data.mcpServers).map(
        ([serverName, entry]): McpServerRecord => ({
            serverName,
            harness: source.harness,
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
