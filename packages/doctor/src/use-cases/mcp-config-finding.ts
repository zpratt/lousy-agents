import type { Finding } from "../entities/finding.js";
import type {
    McpConfigDefect,
    McpConfigDefectReason,
} from "../entities/mcp-config-defect.js";

/** A recognized MCP config file that was present but could not be inventoried. */
export type McpConfigDefectNotice = McpConfigDefect;

/**
 * Constant, content-free text per cause. Never built from the file's content
 * or an absolute path, so a finding cannot leak either.
 */
const REASON_TEXT: Readonly<Record<McpConfigDefectReason, string>> = {
    "invalid-json": "is not valid JSON",
    "invalid-schema": "does not match the MCP config schema",
    "reserved-name":
        "declares a reserved server name (__proto__, constructor, or prototype)",
    "too-large": "is larger than the 1 MiB size limit",
    symlink: "is a symbolic link, which doctor does not follow",
    unreadable: "exists but could not be read as a regular file",
};

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
        description: `The MCP config at ${defect.path} is malformed: it ${REASON_TEXT[defect.reason]}.`,
    }));
}
