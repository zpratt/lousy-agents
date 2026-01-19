/**
 * MCP tool handler for resolving GitHub Action versions.
 * This is a standalone tool for version resolution without workflow creation.
 */

import type { SetupStepCandidate } from "../../entities/copilot-setup.js";
import {
    buildActionsToResolve,
    buildActionToResolve,
    VERSION_RESOLUTION_INSTRUCTIONS,
} from "../../use-cases/action-resolution.js";
import {
    type ResolveActionsArgs,
    type ResolveActionsHandler,
    successResponse,
    type ToolResult,
} from "./types.js";

/**
 * Resolves action versions for the provided actions or detected candidates.
 */
export const resolveActionVersionsHandler: ResolveActionsHandler = async (
    args: ResolveActionsArgs,
): Promise<ToolResult> => {
    // If specific actions are provided, use them directly
    if (args.actions && args.actions.length > 0) {
        const actionsToResolve = args.actions
            .filter((action) => {
                // Filter out already-resolved actions
                if (args.resolvedVersions) {
                    return !args.resolvedVersions.some(
                        (r) => r.action === action,
                    );
                }
                return true;
            })
            .map(buildActionToResolve);

        return successResponse({
            actionsToResolve,
            instructions:
                actionsToResolve.length > 0
                    ? VERSION_RESOLUTION_INSTRUCTIONS
                    : undefined,
            message:
                actionsToResolve.length > 0
                    ? `Found ${actionsToResolve.length} action(s) needing version resolution`
                    : "All actions have been resolved",
        });
    }

    // If no specific actions provided, return common setup actions
    const defaultActions: SetupStepCandidate[] = [
        { action: "actions/setup-node", source: "version-file" },
        { action: "actions/setup-python", source: "version-file" },
        { action: "actions/setup-java", source: "version-file" },
        { action: "actions/setup-go", source: "version-file" },
        { action: "actions/setup-ruby", source: "version-file" },
        { action: "jdx/mise-action", source: "version-file" },
    ];

    const actionsToResolve = buildActionsToResolve(
        defaultActions,
        args.resolvedVersions,
    );

    return successResponse({
        actionsToResolve,
        instructions:
            actionsToResolve.length > 0
                ? VERSION_RESOLUTION_INSTRUCTIONS
                : undefined,
        message:
            actionsToResolve.length > 0
                ? `Found ${actionsToResolve.length} action(s) needing version resolution`
                : "All actions have been resolved",
    });
};
