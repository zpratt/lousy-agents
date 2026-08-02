/**
 * Core domain entities for MCP server configuration lint.
 */

/** A discovered MCP server config file on disk. */
export interface DiscoveredMcpConfigFile {
    readonly filePath: string;
    readonly relativePath: string;
}

/** Severity levels for MCP server lint diagnostics. */
export type McpServerLintSeverity = "error" | "warning";

/** A single lint diagnostic for an MCP server config file. */
export interface McpServerLintDiagnostic {
    readonly line: number;
    readonly severity: McpServerLintSeverity;
    readonly message: string;
    readonly field?: string;
    readonly ruleId: string;
}

/** Lint result for a single MCP server config file. */
export interface McpServerLintResult {
    readonly filePath: string;
    readonly serverCount: number;
    readonly diagnostics: readonly McpServerLintDiagnostic[];
    readonly valid: boolean;
}
