import { McpConfigSchema } from "@lousy-agents/core/entities/mcp-config-schema.js";
import {
    MCP_CONFIG_SOURCES,
    type McpConfigSource,
} from "@lousy-agents/core/entities/mcp-config-source.js";
import { readTextWithinRoot } from "@lousy-agents/core/gateways/file-system-utils.js";
import type { HarnessName } from "../entities/edge-types.js";
import type {
    McpConfigDefect,
    McpConfigDefectReason,
} from "../entities/mcp-config-defect.js";

const MAX_MCP_CONFIG_BYTES = 1_048_576;

export interface McpServerRecord {
    serverName: string;
    transport?: string;
    harness: HarnessName;
    path: string;
}

export interface McpConfigInspection {
    readonly records: readonly McpServerRecord[];
    readonly defects: readonly McpConfigDefect[];
}

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

const MISSING_ERROR_CODES: ReadonlySet<string> = new Set([
    "not-found",
    "ENOENT",
    "ENOTDIR",
]);

function codeOf(value: unknown): string | undefined {
    if (typeof value !== "object" || value === null || !("code" in value)) {
        return undefined;
    }
    return typeof value.code === "string" ? value.code : undefined;
}

/**
 * Classifies a read failure. Only a genuinely missing file (or a missing
 * parent directory) is silent: `undefined`. Anything else means something
 * is at the path that doctor could not inventory, so it is a defect. The
 * reason is chosen from the error's codes only, never its message, which
 * carries absolute paths.
 */
function unreadableReason(error: unknown): McpConfigDefectReason | undefined {
    const code = codeOf(error);
    if (code !== undefined && MISSING_ERROR_CODES.has(code)) {
        return undefined;
    }
    const causeCode = error instanceof Error ? codeOf(error.cause) : undefined;
    if (causeCode === "symlink") {
        return "symlink";
    }
    if (causeCode === "too-large") {
        return "too-large";
    }
    return "unreadable";
}

function defect(
    source: McpConfigSource,
    reason: McpConfigDefectReason,
): McpConfigInspection {
    return {
        records: [],
        defects: [{ path: source.relPath, reason }],
    };
}

async function readMcpServersFromSource(
    repoRoot: string,
    source: McpConfigSource,
): Promise<McpConfigInspection> {
    let content: string;
    try {
        content = await readTextWithinRoot(
            repoRoot,
            source.relPath,
            MAX_MCP_CONFIG_BYTES,
        );
    } catch (error: unknown) {
        const reason = unreadableReason(error);
        return reason === undefined
            ? { records: [], defects: [] }
            : defect(source, reason);
    }

    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return defect(source, "invalid-json");
    }

    if (hasReservedServerName(raw)) {
        return defect(source, "reserved-name");
    }

    const result = McpConfigSchema.safeParse(raw);
    if (!result.success) {
        return defect(source, "invalid-schema");
    }

    const servers = {
        ...(result.data.mcpServers ?? {}),
        ...(result.data.servers ?? {}),
    };

    return {
        records: Object.entries(servers).map(
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
        ),
        defects: [],
    };
}

export async function inspectMcpConfigs(
    repoRoot: string,
): Promise<McpConfigInspection> {
    const records: McpServerRecord[] = [];
    const defects: McpConfigDefect[] = [];
    for (const source of MCP_CONFIG_SOURCES) {
        const read = await readMcpServersFromSource(repoRoot, source);
        records.push(...read.records);
        defects.push(...read.defects);
    }
    return { records, defects };
}

export async function enumerateMcpServers(
    repoRoot: string,
): Promise<McpServerRecord[]> {
    return [...(await inspectMcpConfigs(repoRoot)).records];
}
