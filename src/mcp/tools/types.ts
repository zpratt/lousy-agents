/**
 * Shared types and utilities for MCP tool handlers.
 */

/**
 * Arguments for MCP tools that operate on a target directory.
 */
export interface ToolArgs {
    targetDir?: string;
}

/**
 * Standard result type for MCP tool responses.
 */
export interface ToolResult {
    content: Array<{ type: "text"; text: string }>;
}

/**
 * Tool handler function type.
 */
export type ToolHandler = (args: ToolArgs) => Promise<ToolResult>;

/**
 * Creates an error response for MCP tools.
 */
export function errorResponse(error: string): ToolResult {
    return {
        content: [
            { type: "text", text: JSON.stringify({ success: false, error }) },
        ],
    };
}

/**
 * Creates a success response for MCP tools.
 */
export function successResponse(data: Record<string, unknown>): ToolResult {
    return {
        content: [
            { type: "text", text: JSON.stringify({ success: true, ...data }) },
        ],
    };
}
