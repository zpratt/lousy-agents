/** Why a recognized MCP config file could not be inventoried. */
export type McpConfigDefectReason =
    | "invalid-json"
    | "invalid-schema"
    | "reserved-name"
    | "too-large"
    | "symlink"
    | "unreadable";

/** A recognized MCP config file that was present but could not be inventoried. */
export interface McpConfigDefect {
    /** Repo-relative path, never an absolute one. */
    readonly path: string;
    readonly reason: McpConfigDefectReason;
}
