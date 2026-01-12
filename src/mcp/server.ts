/**
 * MCP Server for Copilot Setup Steps workflow management.
 * Exposes tools for creating, reading, and managing Copilot Setup Steps workflows.
 */

import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
    createEnvironmentGateway,
    createWorkflowGateway,
    fileExists,
} from "../gateways/index.js";
import {
    buildCandidatesFromEnvironment,
    generateWorkflowContent,
    updateWorkflowWithMissingSteps,
} from "../use-cases/copilot-setup.js";
import {
    findMissingCandidates,
    getExistingActionsFromWorkflow,
    mergeCandidates,
} from "../use-cases/setup-step-discovery.js";

// Simple interface for tool arguments
interface ToolArgs {
    targetDir?: string;
}

// Tool result type
interface ToolResult {
    content: Array<{ type: "text"; text: string }>;
}

// Tool handler type to avoid deep type inference issues
type ToolHandler = (args: ToolArgs) => Promise<ToolResult>;

/**
 * Helper to create error response
 */
function errorResponse(error: string): ToolResult {
    return {
        content: [
            { type: "text", text: JSON.stringify({ success: false, error }) },
        ],
    };
}

/**
 * Helper to create success response
 */
function successResponse(data: Record<string, unknown>): ToolResult {
    return {
        content: [
            { type: "text", text: JSON.stringify({ success: true, ...data }) },
        ],
    };
}

/**
 * Handler for discover_environment tool
 */
export const discoverEnvironmentHandler: ToolHandler = async (args) => {
    const dir = args.targetDir || process.cwd();

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    const environmentGateway = createEnvironmentGateway();
    const environment = await environmentGateway.detectEnvironment(dir);

    return successResponse({
        hasMise: environment.hasMise,
        versionFiles: environment.versionFiles.map((vf) => ({
            type: vf.type,
            filename: vf.filename,
            version: vf.version,
        })),
        message: environment.hasMise
            ? "Found mise.toml - mise will manage all tool versions"
            : environment.versionFiles.length > 0
              ? `Found ${environment.versionFiles.length} version file(s)`
              : "No environment configuration files found",
    });
};

/**
 * Handler for discover_workflow_setup_actions tool
 */
export const discoverWorkflowSetupActionsHandler: ToolHandler = async (
    args,
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

/**
 * Handler for read_copilot_setup_workflow tool
 */
export const readCopilotSetupWorkflowHandler: ToolHandler = async (args) => {
    const dir = args.targetDir || process.cwd();

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    const workflowGateway = createWorkflowGateway();
    const exists = await workflowGateway.copilotSetupWorkflowExists(dir);

    if (!exists) {
        return successResponse({
            exists: false,
            workflowPath: join(
                dir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            ),
            message:
                "Copilot Setup Steps workflow does not exist. Use create_copilot_setup_workflow to create it.",
        });
    }

    const workflow = await workflowGateway.readCopilotSetupWorkflow(dir);
    const workflowObj = workflow as Record<string, unknown>;

    // Extract steps from the workflow
    const steps: Array<{
        name?: string;
        uses?: string;
        with?: Record<string, unknown>;
    }> = [];
    const jobs = workflowObj?.jobs as Record<string, unknown> | undefined;
    if (jobs) {
        for (const job of Object.values(jobs)) {
            const jobObj = job as Record<string, unknown>;
            if (Array.isArray(jobObj?.steps)) {
                for (const step of jobObj.steps) {
                    const stepObj = step as Record<string, unknown>;
                    steps.push({
                        name: stepObj.name as string | undefined,
                        uses: stepObj.uses as string | undefined,
                        with: stepObj.with as
                            | Record<string, unknown>
                            | undefined,
                    });
                }
            }
        }
    }

    return successResponse({
        exists: true,
        workflowPath: join(
            dir,
            ".github",
            "workflows",
            "copilot-setup-steps.yml",
        ),
        workflow: {
            name: workflowObj?.name || "Copilot Setup Steps",
            steps,
        },
        message: `Found Copilot Setup Steps workflow with ${steps.length} step(s)`,
    });
};

/**
 * Handler for create_copilot_setup_workflow tool
 */
export const createCopilotSetupWorkflowHandler: ToolHandler = async (args) => {
    const dir = args.targetDir || process.cwd();

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    const environmentGateway = createEnvironmentGateway();
    const workflowGateway = createWorkflowGateway();

    // Step 1: Detect environment configuration
    const environment = await environmentGateway.detectEnvironment(dir);

    // Step 2: Parse existing workflows for setup actions
    const workflowsDir = join(dir, ".github", "workflows");
    const workflowsDirExists = await fileExists(workflowsDir);

    const workflowCandidates = workflowsDirExists
        ? await workflowGateway.parseWorkflowsForSetupActions(dir)
        : [];

    // Step 3: Build candidates from environment
    const envCandidates = await buildCandidatesFromEnvironment(environment);

    // Step 4: Merge candidates (workflow takes precedence)
    const allCandidates = mergeCandidates(workflowCandidates, envCandidates);

    // Step 5: Ensure workflows directory exists
    if (!workflowsDirExists) {
        await mkdir(workflowsDir, { recursive: true });
    }

    // Step 6: Check if workflow exists and create/update accordingly
    const workflowExists =
        await workflowGateway.copilotSetupWorkflowExists(dir);
    const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");

    if (workflowExists) {
        // Update existing workflow
        const existingWorkflow =
            await workflowGateway.readCopilotSetupWorkflow(dir);
        const existingActions =
            getExistingActionsFromWorkflow(existingWorkflow);
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

    // Create new workflow
    const content = await generateWorkflowContent(allCandidates);
    await workflowGateway.writeCopilotSetupWorkflow(dir, content);

    return successResponse({
        action: "created",
        workflowPath,
        stepsAdded: allCandidates.map((c) => c.action),
        message: `Created workflow with ${allCandidates.length + 1} step(s) (including checkout)`,
    });
};

/**
 * Handler for analyze_action_versions tool
 */
export const analyzeActionVersionsHandler: ToolHandler = async (args) => {
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

    // Read all workflow files and extract action references
    const files = await readdir(workflowsDir);
    const yamlFiles = files.filter(
        (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    );

    const workflows: Array<{
        file: string;
        actions: Array<{ name: string; version: string }>;
    }> = [];
    const actionVersions: Map<string, Set<string>> = new Map();

    for (const file of yamlFiles) {
        const filePath = join(workflowsDir, file);
        try {
            const content = await readFile(filePath, "utf-8");
            const workflow = parseYaml(content);
            const actions: Array<{ name: string; version: string }> = [];

            // Extract actions from all jobs and steps
            if (workflow?.jobs && typeof workflow.jobs === "object") {
                for (const job of Object.values(
                    workflow.jobs as Record<string, unknown>,
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

                            // Track unique versions per action
                            if (!actionVersions.has(name)) {
                                actionVersions.set(name, new Set());
                            }
                            actionVersions.get(name)?.add(version);
                        }
                    }
                }
            }

            if (actions.length > 0) {
                workflows.push({ file, actions });
            }
        } catch {
            // Intentionally ignore parse errors for malformed YAML files
            // This is expected behavior - we skip files that can't be parsed
        }
    }

    const uniqueActions = Array.from(actionVersions.entries()).map(
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

/**
 * Creates and configures the MCP server with all tools
 */
export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: "lousy-agents",
        version: "0.1.0",
    });

    // Define shared input schema for tools
    const targetDirInputSchema = {
        targetDir: z
            .string()
            .optional()
            .describe(
                "Target directory to operate on. Defaults to current working directory.",
            ),
    };

    // Register all tools
    // TypeScript has deep type inference issues with MCP SDK generics
    const registerTool = server.registerTool.bind(server) as unknown as (
        name: string,
        config: {
            description: string;
            inputSchema: typeof targetDirInputSchema;
        },
        handler: ToolHandler,
    ) => void;

    registerTool(
        "discover_environment",
        {
            description:
                "Discover environment configuration files (mise.toml, version files like .nvmrc, .python-version, etc.) in a target directory",
            inputSchema: targetDirInputSchema,
        },
        discoverEnvironmentHandler,
    );

    registerTool(
        "discover_workflow_setup_actions",
        {
            description:
                "Discover setup actions used in existing GitHub Actions workflows in a target directory",
            inputSchema: targetDirInputSchema,
        },
        discoverWorkflowSetupActionsHandler,
    );

    registerTool(
        "read_copilot_setup_workflow",
        {
            description:
                "Read the existing Copilot Setup Steps workflow (copilot-setup-steps.yml) from a target directory",
            inputSchema: targetDirInputSchema,
        },
        readCopilotSetupWorkflowHandler,
    );

    registerTool(
        "create_copilot_setup_workflow",
        {
            description:
                "Create or update the Copilot Setup Steps workflow (copilot-setup-steps.yml) based on detected environment configuration",
            inputSchema: targetDirInputSchema,
        },
        createCopilotSetupWorkflowHandler,
    );

    registerTool(
        "analyze_action_versions",
        {
            description:
                "Analyze GitHub Action versions used across all workflow files in a target directory",
            inputSchema: targetDirInputSchema,
        },
        analyzeActionVersionsHandler,
    );

    return server;
}
