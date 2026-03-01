/**
 * CLI command for linting agent skills, custom agents, and instruction files.
 * Discovers targets, validates frontmatter/quality, and reports diagnostics.
 */

import { resolve } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { z } from "zod";
import type { InstructionSuggestion } from "../entities/instruction-quality.js";
import type {
    LintDiagnostic,
    LintOutput,
    LintSeverity,
    LintTarget,
} from "../entities/lint.js";
import type {
    LintRulesConfig,
    RuleConfigMap,
    RuleSeverityConfig,
} from "../entities/lint-rules.js";
import { createFormatter, type LintFormatType } from "../formatters/index.js";
import { createAgentLintGateway } from "../gateways/agent-lint-gateway.js";
import { createInstructionFileDiscoveryGateway } from "../gateways/instruction-file-discovery-gateway.js";
import { createMarkdownAstGateway } from "../gateways/markdown-ast-gateway.js";
import { createFeedbackLoopCommandsGateway } from "../gateways/script-discovery-gateway.js";
import { createSkillLintGateway } from "../gateways/skill-lint-gateway.js";
import { loadLintConfig } from "../lib/lint-config.js";
import { AnalyzeInstructionQualityUseCase } from "../use-cases/analyze-instruction-quality.js";
import type { LintAgentFrontmatterOutput } from "../use-cases/lint-agent-frontmatter.js";
import { LintAgentFrontmatterUseCase } from "../use-cases/lint-agent-frontmatter.js";
import type { LintSkillFrontmatterOutput } from "../use-cases/lint-skill-frontmatter.js";
import { LintSkillFrontmatterUseCase } from "../use-cases/lint-skill-frontmatter.js";

/** Schema for validating target directory */
const TargetDirSchema = z.string().min(1, "Target directory is required");

/**
 * Validates the target directory.
 * Checks for path traversal attempts before resolution.
 */
function validateTargetDir(targetDir: string): string {
    const parsed = TargetDirSchema.parse(targetDir);

    // Check for path traversal attempts in raw input before resolution
    if (parsed.includes("..")) {
        throw new Error(
            `Invalid target directory (path traversal detected): ${targetDir}`,
        );
    }

    return resolve(parsed);
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
 * Formats and displays a LintOutput using consola.
 */
function displayLintOutput(output: LintOutput, label: string): void {
    if (output.summary.totalFiles === 0) {
        consola.info(`No ${label} found`);
        return;
    }

    consola.info(`Discovered ${output.summary.totalFiles} ${label}`);

    // Group diagnostics by file
    const filesWithDiagnostics = new Set<string>();

    for (const d of output.diagnostics) {
        filesWithDiagnostics.add(d.filePath);
    }

    for (const file of output.filesAnalyzed) {
        if (!filesWithDiagnostics.has(file)) {
            consola.success(`${file}: OK`);
        }
    }

    for (const d of output.diagnostics) {
        const prefix = `${d.filePath}:${d.line}`;
        const fieldInfo = d.field ? ` [${d.field}]` : "";

        if (d.severity === "error") {
            consola.error(`${prefix}${fieldInfo}: ${d.message}`);
        } else if (d.severity === "warning") {
            consola.warn(`${prefix}${fieldInfo}: ${d.message}`);
        } else {
            consola.info(`${prefix}${fieldInfo}: ${d.message}`);
        }
    }
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
 * Displays instruction quality analysis results using consola.
 */
function displayInstructionQuality(output: LintOutput): void {
    const result = output.qualityResult;
    if (!result) {
        return;
    }

    if (result.discoveredFiles.length === 0) {
        consola.info("No instruction files found");
    } else {
        consola.info(
            `Discovered ${result.discoveredFiles.length} instruction file(s)`,
        );
        for (const file of result.discoveredFiles) {
            consola.info(`  ${file.filePath} (${file.format})`);
        }
        consola.info(
            `Overall instruction quality score: ${result.overallQualityScore}%`,
        );
    }

    for (const suggestion of result.suggestions) {
        consola.warn(suggestion.message);
    }
}

/** Maps a lint target to its config key */
const TARGET_TO_CONFIG_KEY: Record<LintTarget, keyof LintRulesConfig> = {
    skill: "skills",
    agent: "agents",
    instruction: "instructions",
};

/**
 * Maps config-facing severity to diagnostic-facing severity.
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
 * Drops suggestions whose corresponding rule is "off".
 * Suggestions without a ruleId pass through unchanged.
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
 * Drops diagnostics for "off" rules, remaps severity for "warn"/"error" rules.
 * Diagnostics without a ruleId pass through unchanged.
 * For instruction targets, also filters qualityResult.suggestions.
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
 * The `lint` command for validating agent skills, custom agents, and instruction files.
 */
export const lintCommand = defineCommand({
    meta: {
        name: "lint",
        description:
            "Lint agent skills, custom agents, and instruction files. Validates frontmatter and instruction quality.",
    },
    args: {
        skills: {
            type: "boolean",
            description: "Lint skill frontmatter in .github/skills/",
            default: false,
        },
        agents: {
            type: "boolean",
            description: "Lint custom agent frontmatter in .github/agents/",
            default: false,
        },
        instructions: {
            type: "boolean",
            description:
                "Analyze instruction quality across all instruction file formats",
            default: false,
        },
        format: {
            type: "string",
            description: "Output format: human (default), json, or rdjsonl",
            default: "human",
        },
    },
    run: async (context: CommandContext) => {
        const rawTargetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const targetDir = validateTargetDir(rawTargetDir);

        let rulesConfig: LintRulesConfig;
        try {
            rulesConfig = await loadLintConfig(targetDir);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            consola.error(`Failed to load lint configuration: ${message}`);
            process.exitCode = 1;
            return;
        }

        const lintSkillsFlag =
            context.args?.skills === true || context.data?.skills === true;
        const lintAgentsFlag =
            context.args?.agents === true || context.data?.agents === true;
        const lintInstructionsFlag =
            context.args?.instructions === true ||
            context.data?.instructions === true;

        const noFlagProvided =
            !lintSkillsFlag && !lintAgentsFlag && !lintInstructionsFlag;

        const formatValue =
            (context.args?.format as string) ??
            (context.data?.format as string) ??
            "human";
        const format = (
            ["human", "json", "rdjsonl"].includes(formatValue)
                ? formatValue
                : "human"
        ) as LintFormatType;

        let totalErrors = 0;
        let totalWarnings = 0;
        const allOutputs: LintOutput[] = [];

        if (noFlagProvided || lintSkillsFlag) {
            const rawOutput = await lintSkills(targetDir);
            const skillOutput = applySeverityFilter(rawOutput, rulesConfig);
            allOutputs.push(skillOutput);
            totalErrors += skillOutput.summary.totalErrors;
            totalWarnings += skillOutput.summary.totalWarnings;
        }

        if (noFlagProvided || lintAgentsFlag) {
            const rawOutput = await lintAgents(targetDir);
            const agentOutput = applySeverityFilter(rawOutput, rulesConfig);
            allOutputs.push(agentOutput);
            totalErrors += agentOutput.summary.totalErrors;
            totalWarnings += agentOutput.summary.totalWarnings;
        }

        if (noFlagProvided || lintInstructionsFlag) {
            const rawOutput = await lintInstructions(targetDir);
            const instructionOutput = applySeverityFilter(
                rawOutput,
                rulesConfig,
            );
            allOutputs.push(instructionOutput);
            totalErrors += instructionOutput.summary.totalErrors;
            totalWarnings += instructionOutput.summary.totalWarnings;
        }

        const targetLabels: Record<string, string> = {
            skill: "skill(s)",
            agent: "agent(s)",
            instruction: "instruction file(s)",
        };

        if (format !== "human") {
            const formatter = createFormatter(format);
            const formatted = formatter.format(allOutputs);
            if (formatted) {
                process.stdout.write(`${formatted}\n`);
            }
        } else {
            for (const output of allOutputs) {
                const label = targetLabels[output.target] ?? output.target;
                if (output.target === "instruction") {
                    displayInstructionQuality(output);
                } else {
                    displayLintOutput(output, label);
                }
            }
        }

        if (totalErrors > 0) {
            process.exitCode = 1;

            if (format === "human") {
                consola.error(
                    `lint failed: ${totalErrors} error(s), ${totalWarnings} warning(s)`,
                );
            }

            return;
        }

        if (format === "human") {
            if (totalWarnings > 0) {
                consola.warn(`Lint passed with ${totalWarnings} warning(s)`);
            } else {
                const targets = allOutputs
                    .map((o) => targetLabels[o.target] ?? o.target)
                    .join(", ");
                consola.success(`All ${targets} passed lint checks`);
            }
        }
    },
});
