/**
 * MCP tool handler for resolving GitHub Action versions.
 * This is a standalone tool for version resolution without workflow creation.
 */

import type { SetupStepCandidate } from "../../entities/copilot-setup.js";
import { loadCopilotSetupConfig } from "../../lib/copilot-setup-config.js";
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

    // Load configuration to get supported setup actions
    const config = await loadCopilotSetupConfig();

    // Build candidates from configured setup actions and patterns
    const defaultActions: SetupStepCandidate[] = [
        // Add actions from setupActions config
        ...config.setupActions.map((actionConfig) => ({
            action: actionConfig.action,
            source: "version-file" as const,
        })),
        // Add mise-action if it's in the patterns but not in setupActions
        ...config.setupActionPatterns
            .filter(
                (pattern) =>
                    !config.setupActions.some((a) => a.action === pattern),
            )
            .map((action) => ({
                action,
                source: "version-file" as const,
            })),
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
