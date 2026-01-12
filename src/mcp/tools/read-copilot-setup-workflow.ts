/**
 * MCP tool handler for reading existing Copilot Setup Steps workflow.
 */

import { createWorkflowGateway, fileExists } from "../../gateways/index.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Extracts steps from a workflow object.
 */
function extractWorkflowSteps(workflowObj: Record<string, unknown>): Array<{
    name?: string;
    uses?: string;
    with?: Record<string, unknown>;
}> {
    const steps: Array<{
        name?: string;
        uses?: string;
        with?: Record<string, unknown>;
    }> = [];

    const jobs = workflowObj?.jobs as Record<string, unknown> | undefined;
    if (!jobs) {
        return steps;
    }

    for (const job of Object.values(jobs)) {
        const jobObj = job as Record<string, unknown>;
        const jobSteps = jobObj?.steps;
        if (!Array.isArray(jobSteps)) {
            continue;
        }
        for (const step of jobSteps) {
            const stepObj = step as Record<string, unknown>;
            steps.push({
                name: stepObj.name as string | undefined,
                uses: stepObj.uses as string | undefined,
                with: stepObj.with as Record<string, unknown> | undefined,
            });
        }
    }

    return steps;
}

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
    const steps = extractWorkflowSteps(workflowObj);

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
