/**
 * MCP tool handler for creating or updating Copilot Setup Steps workflow.
 */

import { mkdir } from "node:fs/promises";
import type { SetupStepCandidate } from "@lousy-agents/core/entities/copilot-setup.js";
import type { CopilotSetupConfig } from "@lousy-agents/core/entities/copilot-setup-config.js";
import {
    createEnvironmentGatewayWithConfig,
    createWorkflowGatewayWithConfig,
    fileExists,
    resolveSafePath,
} from "@lousy-agents/core/gateways/index.js";
import { loadCopilotSetupConfig } from "@lousy-agents/core/lib/copilot-setup-config.js";
import {
    buildActionsToResolve,
    VERSION_RESOLUTION_INSTRUCTIONS,
} from "@lousy-agents/core/use-cases/action-resolution.js";
import {
    buildCandidatesFromEnvironment,
    findPlaceholderActionsToPin,
    generateWorkflowContent,
    updateWorkflowWithMissingSteps,
} from "@lousy-agents/core/use-cases/copilot-setup.js";
import type { WorkflowGateway } from "@lousy-agents/core/use-cases/init-copilot-setup-workflow.js";
import {
    findMissingCandidates,
    getExistingActionsFromWorkflow,
    mergeCandidates,
} from "@lousy-agents/core/use-cases/setup-step-discovery.js";
import {
    type CreateWorkflowArgs,
    type CreateWorkflowHandler,
    errorResponse,
    successResponse,
    type ToolResult,
    validateTargetDirectory,
} from "./types.js";

/**
 * Gathers setup step candidates from environment and existing workflows.
 */
async function gatherCandidates(
    dir: string,
    workflowsDirExists: boolean,
    workflowGateway: WorkflowGateway,
    copilotSetupConfig: CopilotSetupConfig,
): Promise<SetupStepCandidate[]> {
    const environmentGateway =
        createEnvironmentGatewayWithConfig(copilotSetupConfig);

    // Detect environment configuration
    const environment = await environmentGateway.detectEnvironment(dir);

    // Parse existing workflows for setup actions
    const workflowCandidates = workflowsDirExists
        ? await workflowGateway.parseWorkflowsForSetupActions(dir)
        : [];

    // Build candidates from environment
    const envCandidates = await buildCandidatesFromEnvironment(
        environment,
        undefined,
        copilotSetupConfig,
    );

    // Merge candidates (workflow takes precedence)
    return mergeCandidates(workflowCandidates, envCandidates);
}

/**
 * Updates an existing workflow with missing steps.
 */
async function updateExistingWorkflow(
    dir: string,
    workflowGateway: WorkflowGateway,
    workflowPath: string,
    allCandidates: SetupStepCandidate[],
    args: CreateWorkflowArgs,
): Promise<ToolResult> {
    const existingWorkflow =
        await workflowGateway.readCopilotSetupWorkflow(dir);
    const existingActions = getExistingActionsFromWorkflow(existingWorkflow);
    const missingCandidates = findMissingCandidates(
        allCandidates,
        existingActions,
    );

    const actionsToPin = findPlaceholderActionsToPin(
        existingWorkflow,
        args.resolvedVersions,
    );

    if (missingCandidates.length === 0 && actionsToPin.length === 0) {
        // Build actions to resolve for version resolution metadata
        const actionsToResolve = buildActionsToResolve(
            allCandidates,
            args.resolvedVersions,
        );

        return successResponse({
            action: "no_changes_needed",
            workflowPath,
            stepsAdded: [],
            message:
                "Copilot Setup Steps workflow already contains all detected setup steps. No changes needed.",
            actionsToResolve,
            instructions:
                actionsToResolve.length > 0
                    ? VERSION_RESOLUTION_INSTRUCTIONS
                    : undefined,
        });
    }

    // Generate workflow with placeholder mode and resolved versions
    const updatedContent = await updateWorkflowWithMissingSteps(
        existingWorkflow,
        missingCandidates,
        undefined,
        {
            usePlaceholders: true,
            resolvedVersions: args.resolvedVersions,
        },
    );
    await workflowGateway.writeCopilotSetupWorkflow(dir, updatedContent);

    // Build actions to resolve
    const actionsToResolve = buildActionsToResolve(
        allCandidates,
        args.resolvedVersions,
    );

    return successResponse({
        action: "updated",
        workflowPath,
        stepsAdded: missingCandidates.map((c) => c.action),
        actionsPinned: actionsToPin,
        message: `Updated workflow with ${missingCandidates.length} new step(s) and ${actionsToPin.length} SHA-pinned action(s)`,
        workflowTemplate: updatedContent,
        actionsToResolve,
        instructions:
            actionsToResolve.length > 0
                ? VERSION_RESOLUTION_INSTRUCTIONS
                : undefined,
    });
}

/**
 * Creates a new workflow with the provided candidates.
 */
async function createNewWorkflow(
    dir: string,
    workflowGateway: WorkflowGateway,
    workflowPath: string,
    allCandidates: SetupStepCandidate[],
    args: CreateWorkflowArgs,
): Promise<ToolResult> {
    // Generate workflow with placeholder mode and resolved versions
    const content = await generateWorkflowContent(allCandidates, undefined, {
        usePlaceholders: true,
        resolvedVersions: args.resolvedVersions,
    });
    await workflowGateway.writeCopilotSetupWorkflow(dir, content);

    // Build actions to resolve
    const actionsToResolve = buildActionsToResolve(
        allCandidates,
        args.resolvedVersions,
    );

    return successResponse({
        action: "created",
        workflowPath,
        stepsAdded: allCandidates.map((c) => c.action),
        message: `Created workflow with ${allCandidates.length + 1} step(s) (including checkout)`,
        workflowTemplate: content,
        actionsToResolve,
        instructions:
            actionsToResolve.length > 0
                ? VERSION_RESOLUTION_INSTRUCTIONS
                : undefined,
    });
}

/**
 * What the create_copilot_setup_workflow handler reads from outside.
 */
export interface CreateWorkflowPorts {
    /** Loads the configuration of the repository at the given directory */
    readonly loadConfig: (directory: string) => Promise<CopilotSetupConfig>;
}

/**
 * Builds the handler for creating or updating the Copilot Setup Steps
 * workflow. The configuration is loaded once per call and shared by the
 * environment detection and the workflow scan, so the two cannot see two
 * different versions of the file.
 */
export function buildCreateCopilotSetupWorkflowHandler(
    ports: CreateWorkflowPorts,
): CreateWorkflowHandler {
    return async (args: CreateWorkflowArgs) => {
        try {
            const dir = args.targetDir || process.cwd();

            const targetDirError = await validateTargetDirectory(dir);
            if (targetDirError) {
                return targetDirError;
            }

            const copilotSetupConfig = await ports.loadConfig(dir);
            const workflowGateway =
                createWorkflowGatewayWithConfig(copilotSetupConfig);
            const workflowsDir = await resolveSafePath(
                dir,
                ".github/workflows",
            );
            const workflowsDirExists = await fileExists(workflowsDir);

            const allCandidates = await gatherCandidates(
                dir,
                workflowsDirExists,
                workflowGateway,
                copilotSetupConfig,
            );

            if (!workflowsDirExists) {
                await mkdir(workflowsDir, { recursive: true });
            }

            const workflowPath =
                await workflowGateway.getCopilotSetupWorkflowPath(dir);

            const workflowExists =
                await workflowGateway.copilotSetupWorkflowExists(dir);

            if (workflowExists) {
                return await updateExistingWorkflow(
                    dir,
                    workflowGateway,
                    workflowPath,
                    allCandidates,
                    args,
                );
            }

            return await createNewWorkflow(
                dir,
                workflowGateway,
                workflowPath,
                allCandidates,
                args,
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Unknown error occurred";
            return errorResponse(
                `Failed to create/update workflow: ${message}`,
            );
        }
    };
}

/**
 * Creates or updates the Copilot Setup Steps workflow.
 */
export const createCopilotSetupWorkflowHandler: CreateWorkflowHandler =
    buildCreateCopilotSetupWorkflowHandler({
        loadConfig: loadCopilotSetupConfig,
    });
