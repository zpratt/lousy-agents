/**
 * MCP tool handler for validating instruction coverage of feedback loops.
 */

import { createEnvironmentGateway } from "../../gateways/environment-gateway.js";
import { createInstructionAnalysisGateway } from "../../gateways/instruction-analysis-gateway.js";
import { createScriptDiscoveryGateway } from "../../gateways/script-discovery-gateway.js";
import { createToolDiscoveryGateway } from "../../gateways/tool-discovery-gateway.js";
import { DiscoverFeedbackLoopsUseCase } from "../../use-cases/discover-feedback-loops.js";
import { ValidateInstructionCoverageUseCase } from "../../use-cases/validate-instruction-coverage.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Validates that repository instructions (.github/copilot-instructions.md and .github/instructions/*.md)
 * document all mandatory feedback loop scripts and tools.
 * Returns coverage percentage and suggestions for missing documentation.
 */
export const validateInstructionCoverageHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    try {
        // Create gateways
        const scriptGateway = createScriptDiscoveryGateway();
        const toolGateway = createToolDiscoveryGateway();
        const environmentGateway = createEnvironmentGateway();
        const instructionGateway = createInstructionAnalysisGateway();

        // Create use cases
        const discoverUseCase = new DiscoverFeedbackLoopsUseCase(
            scriptGateway,
            toolGateway,
            environmentGateway,
        );

        const validateUseCase = new ValidateInstructionCoverageUseCase(
            discoverUseCase,
            instructionGateway,
        );

        // Execute validation
        const result = await validateUseCase.execute({ targetDir: dir });

        const { coverage, hasFullCoverage, suggestions } = result;

        // Format missing items for better readability
        const missing = coverage.missingInInstructions.map((item) => {
            if ("command" in item) {
                // Script
                return {
                    type: "script",
                    name: item.name,
                    phase: item.phase,
                    command: item.command,
                };
            }
            // Tool
            return {
                type: "tool",
                name: item.name,
                phase: item.phase,
                command: item.fullCommand,
            };
        });

        // Format documented items
        const documented = coverage.documentedInInstructions.map((item) => {
            if ("command" in item) {
                // Script
                return {
                    type: "script",
                    name: item.name,
                    phase: item.phase,
                };
            }
            // Tool
            return {
                type: "tool",
                name: item.name,
                phase: item.phase,
            };
        });

        return successResponse({
            hasFullCoverage,
            summary: {
                totalMandatory: coverage.summary.totalMandatory,
                totalDocumented: coverage.summary.totalDocumented,
                coveragePercentage: coverage.summary.coveragePercentage,
            },
            missing,
            documented,
            suggestions,
            message: hasFullCoverage
                ? "✅ All mandatory feedback loops are documented"
                : `⚠️  ${coverage.summary.coveragePercentage.toFixed(1)}% coverage - ${missing.length} mandatory items not documented`,
        });
    } catch (error) {
        return errorResponse(
            `Failed to validate instruction coverage: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
};
