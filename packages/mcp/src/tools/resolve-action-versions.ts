/**
 * MCP tool handler for resolving GitHub Action versions.
 * This is a standalone tool for version resolution without workflow creation.
 */

import type { SetupStepCandidate } from "@lousy-agents/core/entities/copilot-setup.js";
import { loadCopilotSetupConfig } from "@lousy-agents/core/lib/copilot-setup-config.js";
import {
    buildActionsToResolve,
    buildActionToResolve,
    VERSION_RESOLUTION_INSTRUCTIONS,
} from "@lousy-agents/core/use-cases/action-resolution.js";
import {
    errorResponse,
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
    try {
        if (args.actions && args.actions.length > 0) {
            const actionsToResolve = args.actions
                .filter((action) => {
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

        const config = await loadCopilotSetupConfig(args.targetDir);

        const defaultActions: SetupStepCandidate[] = [
            ...config.setupActions.map((actionConfig) => ({
                action: actionConfig.action,
                source: "version-file" as const,
            })),
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
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return errorResponse(`Failed to resolve action versions: ${message}`);
    }
};
