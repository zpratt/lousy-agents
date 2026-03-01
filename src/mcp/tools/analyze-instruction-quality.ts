/**
 * MCP tool handler for analyzing instruction quality.
 */

import { fileExists } from "../../gateways/file-system-utils.js";
import { createInstructionFileDiscoveryGateway } from "../../gateways/instruction-file-discovery-gateway.js";
import { createMarkdownAstGateway } from "../../gateways/markdown-ast-gateway.js";
import { createFeedbackLoopCommandsGateway } from "../../gateways/script-discovery-gateway.js";
import { AnalyzeInstructionQualityUseCase } from "../../use-cases/analyze-instruction-quality.js";
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

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    try {
        const discoveryGateway = createInstructionFileDiscoveryGateway();
        const astGateway = createMarkdownAstGateway();
        const commandsGateway = createFeedbackLoopCommandsGateway();

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
            suggestions: output.result.suggestions.map((s) => s.message),
            parsingErrors: output.result.parsingErrors,
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
