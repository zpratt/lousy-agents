/**
 * MCP tool handler for reading existing Copilot Setup Steps workflow.
 */

import { createWorkflowGateway, fileExists } from "../../gateways/index.js";
import { extractAllWorkflowSteps } from "../../use-cases/setup-step-discovery.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Reads the existing Copilot Setup Steps workflow.
 */
export const readCopilotSetupWorkflowHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    const workflowGateway = createWorkflowGateway();
    const exists = await workflowGateway.copilotSetupWorkflowExists(dir);
    const workflowPath = await workflowGateway.getCopilotSetupWorkflowPath(dir);

    if (!exists) {
        return successResponse({
            exists: false,
            workflowPath,
            message:
                "Copilot Setup Steps workflow does not exist. Use create_copilot_setup_workflow to create it.",
        });
    }

    const workflow = await workflowGateway.readCopilotSetupWorkflow(dir);
    const workflowObj = workflow as Record<string, unknown>;
    const steps = extractAllWorkflowSteps(workflow);

    return successResponse({
        exists: true,
        workflowPath,
        workflow: {
            name: workflowObj?.name || "Copilot Setup Steps",
            steps,
        },
        message: `Found Copilot Setup Steps workflow with ${steps.length} step(s)`,
    });
};
