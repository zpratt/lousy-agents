/**
 * MCP tool handler for discovering scripts and CLI tools.
 */

import { createEnvironmentGateway } from "@lousy-agents/core/gateways/environment-gateway.js";
import { createScriptDiscoveryGateway } from "@lousy-agents/core/gateways/script-discovery-gateway.js";
import { createToolDiscoveryGateway } from "@lousy-agents/core/gateways/tool-discovery-gateway.js";
import {
    DiscoverFeedbackLoopsUseCase,
    type PackageManagerGateway,
} from "@lousy-agents/core/use-cases/discover-feedback-loops.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
    validateTargetDirectory,
} from "./types.js";

/** Groups items by their phase, each as the entry the response shows. */
function groupByPhase<T extends { readonly phase: string }>(
    items: readonly T[],
    toEntry: (item: T) => Record<string, unknown>,
): Record<string, unknown[]> {
    const grouped: Record<string, unknown[]> = {};
    for (const item of items) {
        grouped[item.phase] = [...(grouped[item.phase] ?? []), toEntry(item)];
    }
    return grouped;
}

/**
 * Discovers npm scripts from package.json and CLI tools from GitHub Actions workflows,
 * mapping them to SDLC feedback loop phases (test, build, lint, format, etc.).
 */
export const discoverFeedbackLoopsHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    const targetDirError = await validateTargetDirectory(dir);
    if (targetDirError) {
        return targetDirError;
    }

    try {
        // Create gateways
        const scriptGateway = createScriptDiscoveryGateway();
        const toolGateway = createToolDiscoveryGateway();
        const environmentGateway = createEnvironmentGateway(dir);

        // Adapter for package manager gateway
        const packageManagerGateway: PackageManagerGateway = {
            async detectPackageManagers(targetDir: string) {
                const env =
                    await environmentGateway.detectEnvironment(targetDir);
                return env.packageManagers;
            },
        };

        // Create use case
        const useCase = new DiscoverFeedbackLoopsUseCase(
            scriptGateway,
            toolGateway,
            packageManagerGateway,
        );

        // Execute discovery
        const result = await useCase.execute({ targetDir: dir });

        const { scripts, tools, packageManager } = result.feedbackLoops;

        // Group by phase for better readability
        const scriptsByPhase = groupByPhase(scripts, (script) => ({
            name: script.name,
            command: script.command,
            mandatory: script.isMandatory,
        }));

        const toolsByPhase = groupByPhase(tools, (tool) => ({
            name: tool.name,
            command: tool.fullCommand,
            mandatory: tool.isMandatory,
            source: tool.sourceWorkflow,
        }));

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
            message: `Discovered ${scripts.length} package.json script(s) and ${tools.length} CLI tool(s) from workflows`,
        });
    } catch (error) {
        return errorResponse(
            `Failed to discover feedback loops: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
};
