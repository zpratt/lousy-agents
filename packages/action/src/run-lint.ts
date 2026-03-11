/**
 * Lint orchestration for the GitHub Action.
 * Calls core lint APIs and returns unified LintOutput arrays.
 */

import type { InstructionSuggestion } from "@lousy-agents/core/entities/instruction-quality.js";
import type {
    LintDiagnostic,
    LintOutput,
    LintSeverity,
    LintTarget,
} from "@lousy-agents/core/entities/lint.js";
import type {
    LintRulesConfig,
    RuleConfigMap,
    RuleSeverityConfig,
} from "@lousy-agents/core/entities/lint-rules.js";
import { createFormatter } from "@lousy-agents/core/formatters/index.js";
import { createAgentLintGateway } from "@lousy-agents/core/gateways/agent-lint-gateway.js";
import { createInstructionFileDiscoveryGateway } from "@lousy-agents/core/gateways/instruction-file-discovery-gateway.js";
import { createMarkdownAstGateway } from "@lousy-agents/core/gateways/markdown-ast-gateway.js";
import { createFeedbackLoopCommandsGateway } from "@lousy-agents/core/gateways/script-discovery-gateway.js";
import { createSkillLintGateway } from "@lousy-agents/core/gateways/skill-lint-gateway.js";
import { loadLintConfig } from "@lousy-agents/core/lib/lint-config.js";
import { AnalyzeInstructionQualityUseCase } from "@lousy-agents/core/use-cases/analyze-instruction-quality.js";
import type { LintAgentFrontmatterOutput } from "@lousy-agents/core/use-cases/lint-agent-frontmatter.js";
import { LintAgentFrontmatterUseCase } from "@lousy-agents/core/use-cases/lint-agent-frontmatter.js";
import type { LintSkillFrontmatterOutput } from "@lousy-agents/core/use-cases/lint-skill-frontmatter.js";
import { LintSkillFrontmatterUseCase } from "@lousy-agents/core/use-cases/lint-skill-frontmatter.js";
import type { ActionInputs } from "./validate-inputs.js";

/** Maps a lint target to its config key */
const TARGET_TO_CONFIG_KEY: Record<LintTarget, keyof LintRulesConfig> = {
    skill: "skills",
    agent: "agents",
    instruction: "instructions",
};

/**
 * Maps config severity to diagnostic severity.
 * "warn" → "warning", "error" → "error", "off" → null (drop).
 */
function mapSeverity(configSeverity: RuleSeverityConfig): LintSeverity | null {
    if (configSeverity === "off") {
        return null;
    }
    if (configSeverity === "warn") {
        return "warning";
    }
    return configSeverity;
}

/**
 * Filters instruction suggestions based on rule severity configuration.
 */
function filterInstructionSuggestions(
    suggestions: readonly InstructionSuggestion[],
    rules: RuleConfigMap,
): readonly InstructionSuggestion[] {
    return suggestions.filter((suggestion) => {
        if (!suggestion.ruleId) {
            return true;
        }
        return rules[suggestion.ruleId] !== "off";
    });
}

/**
 * Applies severity filtering to a LintOutput based on rule configuration.
 */
function applySeverityFilter(
    output: LintOutput,
    rulesConfig: LintRulesConfig,
): LintOutput {
    const configKey = TARGET_TO_CONFIG_KEY[output.target];
    const targetRules: RuleConfigMap = rulesConfig[configKey];

    const filteredDiagnostics: LintDiagnostic[] = [];

    for (const diagnostic of output.diagnostics) {
        const configuredSeverity = diagnostic.ruleId
            ? targetRules[diagnostic.ruleId]
            : undefined;

        if (!configuredSeverity) {
            filteredDiagnostics.push(diagnostic);
            continue;
        }

        const mappedSeverity = mapSeverity(configuredSeverity);

        if (mappedSeverity === null) {
            continue;
        }

        filteredDiagnostics.push({
            ...diagnostic,
            severity: mappedSeverity,
        });
    }

    const totalErrors = filteredDiagnostics.filter(
        (d) => d.severity === "error",
    ).length;
    const totalWarnings = filteredDiagnostics.filter(
        (d) => d.severity === "warning",
    ).length;
    const totalInfos = filteredDiagnostics.filter(
        (d) => d.severity === "info",
    ).length;

    const filteredQualityResult =
        output.qualityResult && configKey === "instructions"
            ? {
                  ...output.qualityResult,
                  suggestions: filterInstructionSuggestions(
                      output.qualityResult.suggestions,
                      targetRules,
                  ),
              }
            : output.qualityResult;

    return {
        ...output,
        diagnostics: filteredDiagnostics,
        qualityResult: filteredQualityResult,
        summary: {
            ...output.summary,
            totalErrors,
            totalWarnings,
            totalInfos,
        },
    };
}

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
