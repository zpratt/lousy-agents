/**
 * MCP tool handler for discovering setup actions in existing workflows.
 */

import { join } from "node:path";
import { createWorkflowGateway, fileExists } from "../../gateways/index.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Discovers setup actions used in existing GitHub Actions workflows.
 */
export const discoverWorkflowSetupActionsHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    const workflowGateway = createWorkflowGateway();
    const workflowsDir = join(dir, ".github", "workflows");
    const workflowsDirExists = await fileExists(workflowsDir);

    if (!workflowsDirExists) {
        return successResponse({
            actions: [],
            message:
                "No .github/workflows directory found - no workflows to analyze",
        });
    }

    const candidates = await workflowGateway.parseWorkflowsForSetupActions(dir);

    return successResponse({
        actions: candidates.map((c) => ({
            action: c.action,
            version: c.version,
            config: c.config,
            source: c.source,
        })),
        message:
            candidates.length > 0
                ? `Found ${candidates.length} setup action(s) in workflows`
                : "No setup actions found in existing workflows",
    });
};
