/**
 * MCP tool handler for creating or updating Copilot Setup Steps workflow.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SetupStepCandidate } from "../../entities/copilot-setup.js";
import {
    createEnvironmentGateway,
    createWorkflowGateway,
    fileExists,
} from "../../gateways/index.js";
import {
    buildCandidatesFromEnvironment,
    generateWorkflowContent,
    updateWorkflowWithMissingSteps,
} from "../../use-cases/copilot-setup.js";
import {
    findMissingCandidates,
    getExistingActionsFromWorkflow,
    mergeCandidates,
} from "../../use-cases/setup-step-discovery.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
    type ToolResult,
} from "./types.js";

/**
 * Gathers setup step candidates from environment and existing workflows.
 */
async function gatherCandidates(
    dir: string,
    workflowsDirExists: boolean,
): Promise<SetupStepCandidate[]> {
    const environmentGateway = createEnvironmentGateway();
    const workflowGateway = createWorkflowGateway();

    // Detect environment configuration
    const environment = await environmentGateway.detectEnvironment(dir);

    // Parse existing workflows for setup actions
    const workflowCandidates = workflowsDirExists
        ? await workflowGateway.parseWorkflowsForSetupActions(dir)
        : [];

    // Build candidates from environment
    const envCandidates = await buildCandidatesFromEnvironment(environment);

    // Merge candidates (workflow takes precedence)
    return mergeCandidates(workflowCandidates, envCandidates);
}

/**
 * Updates an existing workflow with missing steps.
 */
async function updateExistingWorkflow(
    dir: string,
    workflowPath: string,
    allCandidates: SetupStepCandidate[],
): Promise<ToolResult> {
    const workflowGateway = createWorkflowGateway();

    const existingWorkflow =
        await workflowGateway.readCopilotSetupWorkflow(dir);
    const existingActions = getExistingActionsFromWorkflow(existingWorkflow);
    const missingCandidates = findMissingCandidates(
        allCandidates,
        existingActions,
    );

    if (missingCandidates.length === 0) {
        return successResponse({
            action: "no_changes_needed",
            workflowPath,
            stepsAdded: [],
            message:
                "Copilot Setup Steps workflow already contains all detected setup steps. No changes needed.",
        });
    }

    const updatedContent = await updateWorkflowWithMissingSteps(
        existingWorkflow,
        missingCandidates,
    );
    await workflowGateway.writeCopilotSetupWorkflow(dir, updatedContent);

    return successResponse({
        action: "updated",
        workflowPath,
        stepsAdded: missingCandidates.map((c) => c.action),
        message: `Updated workflow with ${missingCandidates.length} new step(s)`,
    });
}

/**
 * Creates a new workflow with the provided candidates.
 */
async function createNewWorkflow(
    dir: string,
    workflowPath: string,
    allCandidates: SetupStepCandidate[],
): Promise<ToolResult> {
    const workflowGateway = createWorkflowGateway();

    const content = await generateWorkflowContent(allCandidates);
    await workflowGateway.writeCopilotSetupWorkflow(dir, content);

    return successResponse({
        action: "created",
        workflowPath,
        stepsAdded: allCandidates.map((c) => c.action),
        message: `Created workflow with ${allCandidates.length + 1} step(s) (including checkout)`,
    });
}

/**
 * Creates or updates the Copilot Setup Steps workflow.
 */
export const createCopilotSetupWorkflowHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    const workflowGateway = createWorkflowGateway();
    const workflowsDir = join(dir, ".github", "workflows");
    const workflowsDirExists = await fileExists(workflowsDir);
    const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");

    // Gather all candidates
    const allCandidates = await gatherCandidates(dir, workflowsDirExists);

    // Ensure workflows directory exists
    if (!workflowsDirExists) {
        await mkdir(workflowsDir, { recursive: true });
    }

    // Check if workflow exists and create/update accordingly
    const workflowExists =
        await workflowGateway.copilotSetupWorkflowExists(dir);

    if (workflowExists) {
        return updateExistingWorkflow(dir, workflowPath, allCandidates);
    }

    return createNewWorkflow(dir, workflowPath, allCandidates);
};
