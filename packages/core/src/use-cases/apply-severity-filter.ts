/**
 * Shared severity filtering for lint outputs.
 * Applies rule severity configuration to diagnostics, filtering out "off" rules,
 * remapping "warn" → "warning", and recalculating summary counts.
 */

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

/** Maps a lint target to its config key */
const TARGET_TO_CONFIG_KEY: Record<LintTarget, keyof LintRulesConfig> = {
    skill: "skills",
    agent: "agents",
    hook: "hooks",
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
export function applySeverityFilter(
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
