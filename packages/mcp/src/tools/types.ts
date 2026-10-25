/**
 * Shared types and utilities for MCP tool handlers.
 */

import { stat } from "node:fs/promises";
import type {
    ActionToResolve,
    ResolvedVersion,
} from "@lousy-agents/core/entities/copilot-setup.js";

/**
 * Arguments for MCP tools that operate on a target directory.
 */
export interface ToolArgs {
    targetDir?: string;
}

/**
 * Extended arguments for create_copilot_setup_workflow tool.
 */
export interface CreateWorkflowArgs extends ToolArgs {
    /** Resolved versions to use for SHA-pinning */
    resolvedVersions?: ResolvedVersion[];
}

/**
 * Arguments for resolve_action_versions tool.
 */
export interface ResolveActionsArgs extends ToolArgs {
    /** List of action names to resolve (e.g., ["actions/setup-node", "actions/checkout"]) */
    actions?: string[];
    /** Resolved versions to filter out already-resolved actions */
    resolvedVersions?: ResolvedVersion[];
}

/**
 * Standard result type for MCP tool responses.
 */
export interface ToolResult {
    content: Array<{ type: "text"; text: string }>;
    /** Set on tool execution errors, as the MCP specification requires */
    isError?: boolean;
}

/**
 * Tool handler function type.
 */
export type ToolHandler = (args: ToolArgs) => Promise<ToolResult>;

/**
 * Extended tool handler for create_copilot_setup_workflow.
 */
export type CreateWorkflowHandler = (
    args: CreateWorkflowArgs,
) => Promise<ToolResult>;

/**
 * Extended tool handler for resolve_action_versions.
 */
export type ResolveActionsHandler = (
    args: ResolveActionsArgs,
) => Promise<ToolResult>;

/**
 * Creates an error response for MCP tools.
 */
export function errorResponse(error: string): ToolResult {
    return {
        content: [
            { type: "text", text: JSON.stringify({ success: false, error }) },
        ],
        isError: true,
    };
}

/**
 * Returns an error response when the target path is missing or is not a
 * directory, or null when it is a directory the tool can operate on.
 */
export async function validateTargetDirectory(
    dir: string,
): Promise<ToolResult | null> {
    const dirStat = await stat(dir).catch(() => null);
    if (dirStat === null) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }
    if (!dirStat.isDirectory()) {
        return errorResponse(`Target path is not a directory: ${dir}`);
    }
    return null;
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

/**
 * Response fields for version resolution in create workflow tool.
 */
export interface VersionResolutionResponse {
    /** The generated workflow content */
    workflowTemplate?: string;
    /** Actions that need version resolution */
    actionsToResolve?: ActionToResolve[];
    /** Instructions for the LLM to resolve versions */
    instructions?: string;
}
