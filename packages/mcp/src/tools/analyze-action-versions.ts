/**
 * MCP tool handler for analyzing GitHub Action versions across workflows.
 */

import { join } from "node:path";
import {
    fileExists,
    listDirectoryWithinRoot,
    pathExistsWithinRoot,
    readTextWithinRoot,
} from "@lousy-agents/core/gateways/index.js";
import {
    type ActionReference,
    extractActionsFromWorkflow,
} from "@lousy-agents/core/use-cases/setup-step-discovery.js";
import { parse as parseYaml } from "yaml";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Workflow with action references.
 */
interface WorkflowActions {
    file: string;
    actions: ActionReference[];
}

/**
 * Parses a workflow file and extracts action references.
 */
async function parseWorkflowFile(
    rootDir: string,
    relativePath: string,
): Promise<ActionReference[] | null> {
    try {
        const content = await readTextWithinRoot(
            rootDir,
            relativePath,
            1_048_576,
        );
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
    try {
        const dir = args.targetDir || process.cwd();

        if (!(await fileExists(dir))) {
            return errorResponse(`Target directory does not exist: ${dir}`);
        }

        const workflowsRelativeDir = join(".github", "workflows");
        if (!(await pathExistsWithinRoot(dir, workflowsRelativeDir))) {
            return successResponse({
                workflows: [],
                uniqueActions: [],
                message:
                    "No .github/workflows directory found - no workflows to analyze",
            });
        }

        // Read all workflow files
        const entries = await listDirectoryWithinRoot(
            dir,
            workflowsRelativeDir,
        );
        const files = entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);
        const yamlFiles = files.filter(
            (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
        );

        const workflows: WorkflowActions[] = [];

        for (const file of yamlFiles) {
            const filePath = join(workflowsRelativeDir, file);
            const actions = await parseWorkflowFile(dir, filePath);
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
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return errorResponse(`Failed to analyze action versions: ${message}`);
    }
};
