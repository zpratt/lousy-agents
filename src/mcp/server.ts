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
    createCopilotSetupWorkflowHandler,
    discoverEnvironmentHandler,
    discoverWorkflowSetupActionsHandler,
    readCopilotSetupWorkflowHandler,
    type ToolHandler,
} from "./tools/index.js";

/**
 * Tool configuration for registration.
 */
interface ToolConfig {
    name: string;
    description: string;
    handler: ToolHandler;
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
    },
    {
        name: "discover_workflow_setup_actions",
        description:
            "Discover setup actions used in existing GitHub Actions workflows in a target directory",
        handler: discoverWorkflowSetupActionsHandler,
    },
    {
        name: "read_copilot_setup_workflow",
        description:
            "Read the existing Copilot Setup Steps workflow (copilot-setup-steps.yml) from a target directory",
        handler: readCopilotSetupWorkflowHandler,
    },
    {
        name: "create_copilot_setup_workflow",
        description:
            "Create or update the Copilot Setup Steps workflow (copilot-setup-steps.yml) based on detected environment configuration",
        handler: createCopilotSetupWorkflowHandler,
    },
    {
        name: "analyze_action_versions",
        description:
            "Analyze GitHub Action versions used across all workflow files in a target directory",
        handler: analyzeActionVersionsHandler,
    },
];

/**
 * Creates and configures the MCP server with all tools.
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

    for (const tool of TOOLS) {
        registerTool(
            tool.name,
            {
                description: tool.description,
                inputSchema: targetDirInputSchema,
            },
            tool.handler,
        );
    }

    return server;
}

// Re-export tool handlers for testing
export {
    analyzeActionVersionsHandler,
    createCopilotSetupWorkflowHandler,
    discoverEnvironmentHandler,
    discoverWorkflowSetupActionsHandler,
    readCopilotSetupWorkflowHandler,
} from "./tools/index.js";
