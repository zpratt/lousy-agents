/**
 * MCP Server for Copilot Setup Steps workflow management.
 *
 * This is a Layer 3 (Adapters) component that:
 * - Handles MCP protocol communication
 * - Routes tool calls to appropriate handlers
 * - Does NOT contain business logic
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
    analyzeActionVersionsHandler,
    type CreateWorkflowHandler,
    createCopilotSetupWorkflowHandler,
    discoverEnvironmentHandler,
    discoverWorkflowSetupActionsHandler,
    type ResolveActionsHandler,
    readCopilotSetupWorkflowHandler,
    resolveActionVersionsHandler,
    type ToolHandler,
} from "./tools/index.js";

/**
 * Resolved version schema for input validation.
 */
const resolvedVersionSchema = z.object({
    action: z.string().describe("Action name (e.g., 'actions/setup-node')"),
    sha: z.string().describe("Commit SHA for the action version"),
    versionTag: z.string().describe("Version tag (e.g., 'v4.0.0')"),
});

/**
 * Shared input schema for tools that operate on a target directory.
 */
const targetDirInputSchema = {
    targetDir: z
        .string()
        .optional()
        .describe(
            "Target directory to operate on. Defaults to current working directory.",
        ),
};

/**
 * Extended input schema for create_copilot_setup_workflow tool.
 */
const createWorkflowInputSchema = {
    ...targetDirInputSchema,
    resolvedVersions: z
        .array(resolvedVersionSchema)
        .optional()
        .describe(
            "Array of resolved action versions with SHA and tag. Use this to provide SHA-pinned versions after looking them up.",
        ),
};

/**
 * Input schema for resolve_action_versions tool.
 */
const resolveActionsInputSchema = {
    ...targetDirInputSchema,
    actions: z
        .array(z.string())
        .optional()
        .describe(
            "List of action names to resolve (e.g., ['actions/setup-node']). If not provided, returns common setup actions.",
        ),
    resolvedVersions: z
        .array(resolvedVersionSchema)
        .optional()
        .describe("Array of already-resolved versions to filter out."),
};

/**
 * Tool configuration for registration.
 */
interface ToolConfig {
    name: string;
    description: string;
    handler: ToolHandler | CreateWorkflowHandler | ResolveActionsHandler;
    inputSchema: Record<string, z.ZodTypeAny>;
}

/**
 * All available MCP tools.
 */
const TOOLS: ToolConfig[] = [
    {
        name: "discover_environment",
        description:
            "Discover environment configuration files (mise.toml, version files like .nvmrc, .python-version, etc.) in a target directory",
        handler: discoverEnvironmentHandler,
        inputSchema: targetDirInputSchema,
    },
    {
        name: "discover_workflow_setup_actions",
        description:
            "Discover setup actions used in existing GitHub Actions workflows in a target directory",
        handler: discoverWorkflowSetupActionsHandler,
        inputSchema: targetDirInputSchema,
    },
    {
        name: "read_copilot_setup_workflow",
        description:
            "Read the existing Copilot Setup Steps workflow (copilot-setup-steps.yml or .yaml) from a target directory",
        handler: readCopilotSetupWorkflowHandler,
        inputSchema: targetDirInputSchema,
    },
    {
        name: "create_copilot_setup_workflow",
        description:
            "Create or update the Copilot Setup Steps workflow (copilot-setup-steps.yml) based on detected environment configuration. Returns actions needing version resolution and instructions for SHA-pinning.",
        handler: createCopilotSetupWorkflowHandler,
        inputSchema: createWorkflowInputSchema,
    },
    {
        name: "analyze_action_versions",
        description:
            "Analyze GitHub Action versions used across all workflow files in a target directory",
        handler: analyzeActionVersionsHandler,
        inputSchema: targetDirInputSchema,
    },
    {
        name: "resolve_action_versions",
        description:
            "Get version resolution metadata for GitHub Actions. Returns lookup URLs and instructions for the LLM to fetch latest versions and SHA-pin them. Can be called independently of workflow creation.",
        handler: resolveActionVersionsHandler,
        inputSchema: resolveActionsInputSchema,
    },
];

/**
 * Registers all MCP tools on the server.
 */
function registerTools(server: McpServer): void {
    // TypeScript has deep type inference issues with MCP SDK generics
    const registerTool = server.registerTool.bind(server) as unknown as (
        name: string,
        config: {
            description: string;
            inputSchema: Record<string, z.ZodTypeAny>;
        },
        handler: ToolHandler | CreateWorkflowHandler | ResolveActionsHandler,
    ) => void;

    for (const tool of TOOLS) {
        registerTool(
            tool.name,
            {
                description: tool.description,
                inputSchema: tool.inputSchema,
            },
            tool.handler,
        );
    }
}

/**
 * Creates and configures the MCP server with all tools.
 */
export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: "lousy-agents",
        version: "0.1.0",
    });

    registerTools(server);

    return server;
}

// Re-export tool handlers for testing
export {
    analyzeActionVersionsHandler,
    createCopilotSetupWorkflowHandler,
    discoverEnvironmentHandler,
    discoverWorkflowSetupActionsHandler,
    readCopilotSetupWorkflowHandler,
    resolveActionVersionsHandler,
} from "./tools/index.js";
