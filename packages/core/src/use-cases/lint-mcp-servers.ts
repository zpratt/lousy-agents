/**
 * Use case for linting MCP server configuration files.
 * Validates baseline shape: the config parses as JSON and, when present,
 * `mcpServers` (Claude Code's `.mcp.json` convention) or `servers` (VS
 * Code's `.vscode/mcp.json` convention) is a map of server name to a
 * server declaration.
 */

import { z } from "zod";
import type {
    DiscoveredMcpConfigFile,
    McpServerLintDiagnostic,
    McpServerLintResult,
} from "../entities/mcp-server.js";

const INVALID_JSON_MESSAGE_PREFIX =
    "Invalid JSON in MCP server configuration file";

/**
 * Property names that must never be used as MCP server names: assigning
 * them via a plain object key (as zod's `record()` does when reconstructing
 * parsed output) triggers JavaScript's `__proto__` magic setter instead of
 * creating an own property, silently dropping the entry from validation and
 * counts. Rejected explicitly so a config declaring one of these names
 * fails lint instead of appearing to declare fewer servers than it does.
 */
const RESERVED_SERVER_NAMES = [
    "__proto__",
    "constructor",
    "prototype",
] as const;

const SERVER_MAP_FIELDS = ["mcpServers", "servers"] as const;

/**
 * Zod schema for a single MCP server declaration.
 * Baseline shape only: an object whose optional `type`/`transport` fields,
 * when present, must be non-empty strings. Unknown fields are preserved.
 */
const McpServerEntrySchema = z
    .object({
        type: z.string().min(1, "type must not be empty").optional(),
        transport: z.string().min(1, "transport must not be empty").optional(),
    })
    .passthrough();

/**
 * Zod schema for the MCP config file shape.
 */
export const McpConfigSchema = z
    .object({
        mcpServers: z.record(z.string(), McpServerEntrySchema).optional(),
        servers: z.record(z.string(), McpServerEntrySchema).optional(),
    })
    .passthrough();

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function reservedNameDiagnostic(
    field: string,
    reservedName: string,
): McpServerLintDiagnostic {
    return {
        line: 1,
        severity: "error",
        message: `Server name '${reservedName}' is a reserved JavaScript property name and is not allowed.`,
        field: `${field}.${reservedName}`,
        ruleId: "mcpserver/invalid-config",
    };
}

function reservedNamesInServerMap(
    servers: Record<string, unknown>,
    field: string,
): McpServerLintDiagnostic[] {
    const diagnostics: McpServerLintDiagnostic[] = [];
    for (const reservedName of RESERVED_SERVER_NAMES) {
        if (Object.hasOwn(servers, reservedName)) {
            diagnostics.push(reservedNameDiagnostic(field, reservedName));
        }
    }
    return diagnostics;
}

/**
 * Scans the raw (pre-zod) parsed config for reserved server names. Must run
 * against the raw `JSON.parse` output, which preserves `__proto__` as an
 * ordinary own property, rather than against zod's reconstructed output.
 */
function findReservedServerNameDiagnostics(
    parsed: unknown,
): McpServerLintDiagnostic[] {
    if (!isPlainObject(parsed)) {
        return [];
    }

    const diagnostics: McpServerLintDiagnostic[] = [];
    for (const field of SERVER_MAP_FIELDS) {
        const servers = parsed[field];
        if (!isPlainObject(servers)) {
            continue;
        }
        diagnostics.push(...reservedNamesInServerMap(servers, field));
    }
    return diagnostics;
}

function invalidJsonResult(
    filePath: string,
    error: unknown,
): McpServerLintResult {
    const detail =
        error instanceof Error && error.message ? `: ${error.message}` : ".";
    return {
        filePath,
        serverCount: 0,
        diagnostics: [
            {
                line: 1,
                severity: "error",
                message: `${INVALID_JSON_MESSAGE_PREFIX}${detail}`,
                ruleId: "mcpserver/invalid-json",
            },
        ],
        valid: false,
    };
}

function invalidConfigResult(
    filePath: string,
    diagnostics: McpServerLintDiagnostic[],
): McpServerLintResult {
    return {
        filePath,
        serverCount: 0,
        diagnostics,
        valid: false,
    };
}

function zodIssuesToDiagnostics(
    issues: z.ZodIssue[],
): McpServerLintDiagnostic[] {
    return issues.map((issue) => ({
        line: 1,
        severity: "error" as const,
        message: issue.message,
        field: issue.path.length > 0 ? issue.path.join(".") : undefined,
        ruleId: "mcpserver/invalid-config" as const,
    }));
}

function countBySeverity(
    results: McpServerLintResult[],
    severity: "error" | "warning",
): number {
    return results.reduce(
        (sum, r) =>
            sum + r.diagnostics.filter((d) => d.severity === severity).length,
        0,
    );
}

/**
 * Port for MCP server lint gateway operations.
 */
export interface McpServersLintGateway {
    discoverMcpConfigFiles(
        targetDir: string,
    ): Promise<DiscoveredMcpConfigFile[]>;
    readFileContent(filePath: string): Promise<string>;
}

/**
 * Input for the lint MCP servers use case.
 */
export interface LintMcpServersInput {
    targetDir: string;
}

/**
 * Output from the lint MCP servers use case.
 */
export interface LintMcpServersOutput {
    results: McpServerLintResult[];
    totalFiles: number;
    totalErrors: number;
    totalWarnings: number;
}

/**
 * Use case for linting MCP server configuration files across a repository.
 */
export class LintMcpServersUseCase {
    constructor(private readonly gateway: McpServersLintGateway) {}

    async execute(input: LintMcpServersInput): Promise<LintMcpServersOutput> {
        if (!input.targetDir) {
            throw new Error("Target directory is required");
        }

        const files = await this.gateway.discoverMcpConfigFiles(
            input.targetDir,
        );

        const results: McpServerLintResult[] = [];

        for (const file of files) {
            const content = await this.gateway.readFileContent(file.filePath);
            results.push(this.lintFile(file, content));
        }

        return {
            results,
            totalFiles: files.length,
            totalErrors: countBySeverity(results, "error"),
            totalWarnings: countBySeverity(results, "warning"),
        };
    }

    private lintFile(
        file: DiscoveredMcpConfigFile,
        content: string,
    ): McpServerLintResult {
        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (error) {
            return invalidJsonResult(file.filePath, error);
        }

        const reservedNameDiagnostics =
            findReservedServerNameDiagnostics(parsed);
        if (reservedNameDiagnostics.length > 0) {
            return invalidConfigResult(file.filePath, reservedNameDiagnostics);
        }

        const result = McpConfigSchema.safeParse(parsed);
        if (!result.success) {
            return invalidConfigResult(
                file.filePath,
                zodIssuesToDiagnostics(result.error.issues),
            );
        }

        const servers = {
            ...(result.data.mcpServers ?? {}),
            ...(result.data.servers ?? {}),
        };

        return {
            filePath: file.filePath,
            serverCount: Object.keys(servers).length,
            diagnostics: [],
            valid: true,
        };
    }
}
