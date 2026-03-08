/**
 * Lint configuration loader.
 * Loads lint rule severity overrides from c12 config and merges with defaults.
 */

import { loadConfig } from "c12";
import { z } from "zod";
import {
    DEFAULT_LINT_RULES,
    type LintRulesConfig,
    type RuleConfigMap,
    type RuleSeverityConfig,
} from "../entities/lint-rules.js";

/** Zod schema for a rule config map: rule IDs validated with regex to prevent prototype pollution */
const RuleConfigMapSchema = z.record(
    z.string().regex(/^[a-z]+\/[a-z]+(?:-[a-z]+)*$/),
    z.enum(["error", "warn", "off"]),
);

/** Zod schema for the lint.rules section of the config */
const LintRulesConfigSchema = z.object({
    agents: RuleConfigMapSchema.optional(),
    instructions: RuleConfigMapSchema.optional(),
    skills: RuleConfigMapSchema.optional(),
});

/** Zod schema for the lint section of the config */
const LintConfigSchema = z.object({
    lint: z
        .object({
            rules: LintRulesConfigSchema.optional(),
        })
        .optional(),
});

/**
 * Merges user overrides with defaults for a single target.
 * Only known rule IDs (present in defaults) are applied; unknown IDs are discarded.
 */
function mergeTargetRules(
    defaults: RuleConfigMap,
    overrides: RuleConfigMap | undefined,
): RuleConfigMap {
    if (!overrides) {
        return defaults;
    }

    const merged: Record<string, RuleSeverityConfig> = {
        ...defaults,
    };

    for (const [ruleId, severity] of Object.entries(overrides)) {
        if (Object.hasOwn(defaults, ruleId)) {
            merged[ruleId] = severity;
        }
    }

    return merged;
}

/**
 * Loads lint configuration from the target directory using c12.
 * Merges user overrides with default rule severities.
 * Throws on config load failures (syntax errors, permission denied, validation errors).
 */
export async function loadLintConfig(
    targetDir: string,
): Promise<LintRulesConfig> {
    const { config } = await loadConfig({
        name: "lousy-agents",
        cwd: targetDir,
    });

    if (!config) {
        return DEFAULT_LINT_RULES;
    }

    const parsed = LintConfigSchema.parse(config);

    const rules = parsed.lint?.rules;

    if (!rules) {
        return DEFAULT_LINT_RULES;
    }

    return {
        agents: mergeTargetRules(DEFAULT_LINT_RULES.agents, rules.agents),
        instructions: mergeTargetRules(
            DEFAULT_LINT_RULES.instructions,
            rules.instructions,
        ),
        skills: mergeTargetRules(DEFAULT_LINT_RULES.skills, rules.skills),
    };
}
