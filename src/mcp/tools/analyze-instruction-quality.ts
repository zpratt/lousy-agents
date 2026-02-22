/**
 * MCP tool handler for analyzing instruction quality.
 */

import { createInstructionFileDiscoveryGateway } from "../../gateways/instruction-file-discovery-gateway.js";
import { createMarkdownAstGateway } from "../../gateways/markdown-ast-gateway.js";
import { createScriptDiscoveryGateway } from "../../gateways/script-discovery-gateway.js";
import {
    AnalyzeInstructionQualityUseCase,
    type FeedbackLoopCommandsGateway,
} from "../../use-cases/analyze-instruction-quality.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Analyzes the structural quality of feedback loop documentation in instruction files.
 * Assesses structural context, execution clarity, and loop completeness.
 */
export const analyzeInstructionQualityHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    try {
        const discoveryGateway = createInstructionFileDiscoveryGateway();
        const astGateway = createMarkdownAstGateway();

        // Simple commands gateway that discovers npm scripts
        const scriptGateway = createScriptDiscoveryGateway();
        const commandsGateway: FeedbackLoopCommandsGateway = {
            async getMandatoryCommands(targetDir: string) {
                const scripts = await scriptGateway.discoverScripts(targetDir);
                return scripts.filter((s) => s.isMandatory).map((s) => s.name);
            },
        };

        const useCase = new AnalyzeInstructionQualityUseCase(
            discoveryGateway,
            astGateway,
            commandsGateway,
        );

        const output = await useCase.execute({ targetDir: dir });

        return successResponse({
            discoveredFiles: output.result.discoveredFiles.map((f) => ({
                filePath: f.filePath,
                format: f.format,
            })),
            commandScores: output.result.commandScores.map((s) => ({
                commandName: s.commandName,
                structuralContext: s.structuralContext,
                executionClarity: s.executionClarity,
                loopCompleteness: s.loopCompleteness,
                compositeScore: s.compositeScore,
                bestSourceFile: s.bestSourceFile,
            })),
            overallQualityScore: output.result.overallQualityScore,
            suggestions: output.result.suggestions,
            diagnostics: output.diagnostics.map((d) => ({
                filePath: d.filePath,
                line: d.line,
                severity: d.severity,
                message: d.message,
                ruleId: d.ruleId,
            })),
        });
    } catch (error) {
        return errorResponse(
            `Failed to analyze instruction quality: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
};
