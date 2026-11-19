import type { Finding } from "../entities/finding.js";

/** A recognized MCP config file that was present but could not be inventoried. */
export interface McpConfigDefectNotice {
    readonly path: string;
}

/**
 * One high defect per malformed MCP config. The target is the repo-relative
 * path, so a longer path does not satisfy a shorter one. A missing file is
 * not a defect, and no server record is invented for a file that did not parse.
 */
export function mcpConfigFindings(
    defects: readonly McpConfigDefectNotice[],
): Finding[] {
    return defects.map((defect) => ({
        id: `malformed-mcp-config:${defect.path}`,
        criterionId: "malformed-mcp-config",
        targetId: defect.path,
        severity: "high",
        category: "malformed-reference",
        classification: "defect",
        intentGated: false,
        assumedIntent: false,
        description: `The MCP config at ${defect.path} is not valid JSON, does not match the MCP config schema, or uses a reserved server name.`,
    }));
}
