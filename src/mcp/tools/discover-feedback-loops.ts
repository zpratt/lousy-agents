/**
 * MCP tool handler for discovering scripts and CLI tools.
 */

import { createEnvironmentGateway } from "../../gateways/environment-gateway.js";
import { createScriptDiscoveryGateway } from "../../gateways/script-discovery-gateway.js";
import { createToolDiscoveryGateway } from "../../gateways/tool-discovery-gateway.js";
import { DiscoverFeedbackLoopsUseCase } from "../../use-cases/discover-feedback-loops.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Discovers npm scripts from package.json and CLI tools from GitHub Actions workflows,
 * mapping them to SDLC feedback loop phases (test, build, lint, format, etc.).
 */
export const discoverFeedbackLoopsHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    try {
        // Create gateways
        const scriptGateway = createScriptDiscoveryGateway();
        const toolGateway = createToolDiscoveryGateway();
        const environmentGateway = createEnvironmentGateway();

        // Create use case
        const useCase = new DiscoverFeedbackLoopsUseCase(
            scriptGateway,
            toolGateway,
            environmentGateway,
        );

        // Execute discovery
        const result = await useCase.execute({ targetDir: dir });

        const { scripts, tools, packageManager } = result.feedbackLoops;

        // Group by phase for better readability
        const scriptsByPhase = scripts.reduce(
            (acc, script) => {
                if (!acc[script.phase]) {
                    acc[script.phase] = [];
                }
                acc[script.phase].push({
                    name: script.name,
                    command: script.command,
                    mandatory: script.isMandatory,
                });
                return acc;
            },
            {} as Record<string, unknown[]>,
        );

        const toolsByPhase = tools.reduce(
            (acc, tool) => {
                if (!acc[tool.phase]) {
                    acc[tool.phase] = [];
                }
                acc[tool.phase].push({
                    name: tool.name,
                    command: tool.fullCommand,
                    mandatory: tool.isMandatory,
                    source: tool.sourceWorkflow,
                });
                return acc;
            },
            {} as Record<string, unknown[]>,
        );

        const mandatoryScripts = scripts.filter((s) => s.isMandatory);
        const mandatoryTools = tools.filter((t) => t.isMandatory);

        return successResponse({
            summary: {
                totalScripts: scripts.length,
                totalTools: tools.length,
                mandatoryScripts: mandatoryScripts.length,
                mandatoryTools: mandatoryTools.length,
                packageManager: packageManager || "none detected",
            },
            scriptsByPhase,
            toolsByPhase,
            message: `Discovered ${scripts.length} npm scripts and ${tools.length} CLI tools`,
        });
    } catch (error) {
        return errorResponse(
            `Failed to discover feedback loops: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
};
