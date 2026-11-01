/**
 * MCP tool handler for validating instruction coverage of feedback loops.
 */

import { createEnvironmentGateway } from "@lousy-agents/core/gateways/environment-gateway.js";
import { createInstructionAnalysisGateway } from "@lousy-agents/core/gateways/instruction-analysis-gateway.js";
import { createScriptDiscoveryGateway } from "@lousy-agents/core/gateways/script-discovery-gateway.js";
import { createToolDiscoveryGateway } from "@lousy-agents/core/gateways/tool-discovery-gateway.js";
import {
    DiscoverFeedbackLoopsUseCase,
    type PackageManagerGateway,
} from "@lousy-agents/core/use-cases/discover-feedback-loops.js";
import { ValidateInstructionCoverageUseCase } from "@lousy-agents/core/use-cases/validate-instruction-coverage.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
    validateTargetDirectory,
} from "./types.js";

interface CoverageMessageInput {
    hasFullCoverage: boolean;
    coveragePercentage: number;
    missingCount: number;
    discoveryStoppedEarly: boolean;
}

/**
 * Summarizes the coverage. When discovery stopped early the result says so:
 * a mandatory item reported as undocumented may be documented in a file that
 * was not checked, and a fully documented result covers only the files found.
 */
function coverageMessage({
    hasFullCoverage,
    coveragePercentage,
    missingCount,
    discoveryStoppedEarly,
}: CoverageMessageInput): string {
    if (hasFullCoverage) {
        return discoveryStoppedEarly
            ? "✅ All mandatory feedback loops are documented in the instruction files found, but discovery stopped early, so other instruction files were not checked"
            : "✅ All mandatory feedback loops are documented";
    }
    const measured = `${coveragePercentage.toFixed(1)}% coverage - ${missingCount} mandatory items not documented`;
    return discoveryStoppedEarly
        ? `⚠️  ${measured} in the instruction files found; discovery stopped early, so they may be documented in files that were not checked`
        : `⚠️  ${measured}`;
}

/**
 * Validates that repository instruction files (the catalog shared with analyze_instruction_quality)
 * document all mandatory feedback loop scripts and tools.
 * Returns coverage percentage and suggestions for missing documentation.
 */
export const validateInstructionCoverageHandler: ToolHandler = async (
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
        const instructionGateway = createInstructionAnalysisGateway();

        // Adapter for package manager gateway
        const packageManagerGateway: PackageManagerGateway = {
            async detectPackageManagers(targetDir: string) {
                const env =
                    await environmentGateway.detectEnvironment(targetDir);
                return env.packageManagers;
            },
        };

        // Create use cases
        const discoverUseCase = new DiscoverFeedbackLoopsUseCase(
            scriptGateway,
            toolGateway,
            packageManagerGateway,
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
            diagnostics: coverage.diagnostics.map((d) => ({
                ruleId: d.ruleId,
                message: d.message,
            })),
            message: coverageMessage({
                hasFullCoverage,
                coveragePercentage: coverage.summary.coveragePercentage,
                missingCount: missing.length,
                discoveryStoppedEarly: coverage.diagnostics.length > 0,
            }),
        });
    } catch (error) {
        return errorResponse(
            `Failed to validate instruction coverage: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
};
