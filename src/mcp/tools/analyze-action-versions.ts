/**
 * MCP tool handler for analyzing GitHub Action versions across workflows.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { fileExists } from "../../gateways/index.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Action reference with name and version.
 */
interface ActionReference {
    name: string;
    version: string;
}

/**
 * Workflow with action references.
 */
interface WorkflowActions {
    file: string;
    actions: ActionReference[];
}

/**
 * Extracts action references from a parsed workflow.
 */
function extractActionsFromWorkflow(workflow: unknown): ActionReference[] {
    const actions: ActionReference[] = [];

    if (!workflow || typeof workflow !== "object") {
        return actions;
    }

    const workflowObj = workflow as Record<string, unknown>;
    if (!workflowObj.jobs || typeof workflowObj.jobs !== "object") {
        return actions;
    }

    for (const job of Object.values(
        workflowObj.jobs as Record<string, unknown>,
    )) {
        if (!job || typeof job !== "object") continue;
        const jobObj = job as Record<string, unknown>;
        if (!Array.isArray(jobObj.steps)) continue;

        for (const step of jobObj.steps) {
            if (!step || typeof step !== "object") continue;
            const stepObj = step as Record<string, unknown>;
            const uses = stepObj.uses;
            if (typeof uses !== "string") continue;

            const atIndex = uses.indexOf("@");
            if (atIndex !== -1) {
                const name = uses.substring(0, atIndex);
                const version = uses.substring(atIndex + 1);
                actions.push({ name, version });
            }
        }
    }

    return actions;
}

/**
 * Parses a workflow file and extracts action references.
 */
async function parseWorkflowFile(
    filePath: string,
): Promise<ActionReference[] | null> {
    try {
        const content = await readFile(filePath, "utf-8");
        const workflow = parseYaml(content);
        return extractActionsFromWorkflow(workflow);
    } catch {
        // Intentionally ignore parse errors for malformed YAML files
        return null;
    }
}

/**
 * Builds a map of unique actions to their versions.
 */
function buildUniqueActionsMap(
    workflows: WorkflowActions[],
): Map<string, Set<string>> {
    const actionVersions = new Map<string, Set<string>>();

    for (const workflow of workflows) {
        for (const action of workflow.actions) {
            if (!actionVersions.has(action.name)) {
                actionVersions.set(action.name, new Set());
            }
            actionVersions.get(action.name)?.add(action.version);
        }
    }

    return actionVersions;
}

/**
 * Analyzes GitHub Action versions used across all workflow files.
 */
export const analyzeActionVersionsHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    const workflowsDir = join(dir, ".github", "workflows");
    if (!(await fileExists(workflowsDir))) {
        return successResponse({
            workflows: [],
            uniqueActions: [],
            message:
                "No .github/workflows directory found - no workflows to analyze",
        });
    }

    // Read all workflow files
    const files = await readdir(workflowsDir);
    const yamlFiles = files.filter(
        (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    );

    const workflows: WorkflowActions[] = [];

    for (const file of yamlFiles) {
        const filePath = join(workflowsDir, file);
        const actions = await parseWorkflowFile(filePath);
        if (actions && actions.length > 0) {
            workflows.push({ file, actions });
        }
    }

    // Build unique actions map
    const actionVersionsMap = buildUniqueActionsMap(workflows);
    const uniqueActions = Array.from(actionVersionsMap.entries()).map(
        ([name, versions]) => ({
            name,
            versions: Array.from(versions),
        }),
    );

    const totalActions = workflows.reduce(
        (sum, w) => sum + w.actions.length,
        0,
    );

    return successResponse({
        workflows,
        uniqueActions,
        message:
            workflows.length > 0
                ? `Found ${totalActions} action reference(s) across ${workflows.length} workflow(s), ${uniqueActions.length} unique action(s)`
                : "No action references found in workflows",
    });
};
