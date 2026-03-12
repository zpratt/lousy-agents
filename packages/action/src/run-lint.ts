/**
 * Lint orchestration for the GitHub Action.
 * Calls core lint APIs and returns unified LintOutput arrays.
 */

import type {
    LintDiagnostic,
    LintOutput,
} from "@lousy-agents/core/entities/lint.js";
import { createFormatter } from "@lousy-agents/core/formatters/index.js";
import { createAgentLintGateway } from "@lousy-agents/core/gateways/agent-lint-gateway.js";
import { createInstructionFileDiscoveryGateway } from "@lousy-agents/core/gateways/instruction-file-discovery-gateway.js";
import { createMarkdownAstGateway } from "@lousy-agents/core/gateways/markdown-ast-gateway.js";
import { createFeedbackLoopCommandsGateway } from "@lousy-agents/core/gateways/script-discovery-gateway.js";
import { createSkillLintGateway } from "@lousy-agents/core/gateways/skill-lint-gateway.js";
import { loadLintConfig } from "@lousy-agents/core/lib/lint-config.js";
import { AnalyzeInstructionQualityUseCase } from "@lousy-agents/core/use-cases/analyze-instruction-quality.js";
import { applySeverityFilter } from "@lousy-agents/core/use-cases/apply-severity-filter.js";
import type { LintAgentFrontmatterOutput } from "@lousy-agents/core/use-cases/lint-agent-frontmatter.js";
import { LintAgentFrontmatterUseCase } from "@lousy-agents/core/use-cases/lint-agent-frontmatter.js";
import type { LintSkillFrontmatterOutput } from "@lousy-agents/core/use-cases/lint-skill-frontmatter.js";
import { LintSkillFrontmatterUseCase } from "@lousy-agents/core/use-cases/lint-skill-frontmatter.js";
import type { ActionInputs } from "./validate-inputs.js";

/**
 * Converts skill lint output to unified LintOutput.
 */
function skillOutputToLintOutput(
    output: LintSkillFrontmatterOutput,
): LintOutput {
    const diagnostics: LintDiagnostic[] = [];

    for (const result of output.results) {
        for (const d of result.diagnostics) {
            diagnostics.push({
                filePath: result.filePath,
                line: d.line,
                severity: d.severity,
                message: d.message,
                field: d.field,
                ruleId: d.ruleId,
                target: "skill",
            });
        }
    }

    return {
        diagnostics,
        target: "skill",
        filesAnalyzed: output.results.map((r) => r.filePath),
        summary: {
            totalFiles: output.totalSkills,
            totalErrors: output.totalErrors,
            totalWarnings: output.totalWarnings,
            totalInfos: 0,
        },
    };
}

/**
 * Converts agent lint output to unified LintOutput.
 */
function agentOutputToLintOutput(
    output: LintAgentFrontmatterOutput,
): LintOutput {
    const diagnostics: LintDiagnostic[] = [];

    for (const result of output.results) {
        for (const d of result.diagnostics) {
            diagnostics.push({
                filePath: result.filePath,
                line: d.line,
                severity: d.severity,
                message: d.message,
                field: d.field,
                ruleId: d.ruleId,
                target: "agent",
            });
        }
    }

    return {
        diagnostics,
        target: "agent",
        filesAnalyzed: output.results.map((r) => r.filePath),
        summary: {
            totalFiles: output.totalAgents,
            totalErrors: output.totalErrors,
            totalWarnings: output.totalWarnings,
            totalInfos: 0,
        },
    };
}

/**
 * Runs skill linting.
 */
async function lintSkills(targetDir: string): Promise<LintOutput> {
    const gateway = createSkillLintGateway();
    const useCase = new LintSkillFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return skillOutputToLintOutput(output);
}

/**
 * Runs agent linting.
 */
async function lintAgents(targetDir: string): Promise<LintOutput> {
    const gateway = createAgentLintGateway();
    const useCase = new LintAgentFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return agentOutputToLintOutput(output);
}

/**
 * Runs instruction quality analysis.
 */
async function lintInstructions(targetDir: string): Promise<LintOutput> {
    const discoveryGateway = createInstructionFileDiscoveryGateway();
    const astGateway = createMarkdownAstGateway();
    const commandsGateway = createFeedbackLoopCommandsGateway();

    const useCase = new AnalyzeInstructionQualityUseCase(
        discoveryGateway,
        astGateway,
        commandsGateway,
    );

    const output = await useCase.execute({ targetDir });

    const filesAnalyzed = output.result.discoveredFiles.map((f) => f.filePath);

    return {
        diagnostics: output.diagnostics,
        target: "instruction",
        filesAnalyzed,
        qualityResult: output.result,
        summary: {
            totalFiles: filesAnalyzed.length,
            totalErrors: output.diagnostics.filter(
                (d) => d.severity === "error",
            ).length,
            totalWarnings: output.diagnostics.filter(
                (d) => d.severity === "warning",
            ).length,
            totalInfos: output.diagnostics.filter((d) => d.severity === "info")
                .length,
        },
    };
}

/**
 * Runs lint for the specified targets and returns rdjsonl-formatted output.
 * Returns an object with the formatted string and whether errors were found.
 */
export async function runLint(
    inputs: ActionInputs,
): Promise<{ output: string; hasErrors: boolean }> {
    const rulesConfig = await loadLintConfig(inputs.directory);

    const noFlagProvided =
        !inputs.skills && !inputs.agents && !inputs.instructions;

    const allOutputs: LintOutput[] = [];
    let totalErrors = 0;

    if (noFlagProvided || inputs.skills) {
        const rawOutput = await lintSkills(inputs.directory);
        const filtered = applySeverityFilter(rawOutput, rulesConfig);
        allOutputs.push(filtered);
        totalErrors += filtered.summary.totalErrors;
    }

    if (noFlagProvided || inputs.agents) {
        const rawOutput = await lintAgents(inputs.directory);
        const filtered = applySeverityFilter(rawOutput, rulesConfig);
        allOutputs.push(filtered);
        totalErrors += filtered.summary.totalErrors;
    }

    if (noFlagProvided || inputs.instructions) {
        const rawOutput = await lintInstructions(inputs.directory);
        const filtered = applySeverityFilter(rawOutput, rulesConfig);
        allOutputs.push(filtered);
        totalErrors += filtered.summary.totalErrors;
    }

    const formatter = createFormatter("rdjsonl");
    const formatted = formatter.format(allOutputs);

    return { output: formatted, hasErrors: totalErrors > 0 };
}
