/**
 * Lint rule registry entity.
 * Defines all known lint rule IDs with their default severities, organized by target.
 */

/** Valid severity values for rule configuration */
export type RuleSeverityConfig = "error" | "warn" | "off";

/** A map of rule IDs to their configured severity */
export type RuleConfigMap = Readonly<Record<string, RuleSeverityConfig>>;

/** Lint configuration organized by target */
export interface LintRulesConfig {
    readonly agents: RuleConfigMap;
    readonly instructions: RuleConfigMap;
    readonly skills: RuleConfigMap;
}

/** Default severity levels for all known lint rules */
export const DEFAULT_LINT_RULES: LintRulesConfig = {
    agents: {
        "agent/missing-frontmatter": "error",
        "agent/invalid-frontmatter": "error",
        "agent/missing-name": "error",
        "agent/invalid-name-format": "error",
        "agent/name-mismatch": "error",
        "agent/missing-description": "error",
        "agent/invalid-description": "error",
        "agent/invalid-field": "warn",
    },
    instructions: {
        "instruction/parse-error": "warn",
        "instruction/command-not-in-code-block": "warn",
        "instruction/command-outside-section": "warn",
        "instruction/missing-error-handling": "warn",
    },
    skills: {
        "skill/invalid-frontmatter": "error",
        "skill/missing-frontmatter": "error",
        "skill/missing-name": "error",
        "skill/invalid-name-format": "error",
        "skill/name-mismatch": "error",
        "skill/missing-description": "error",
        "skill/invalid-description": "error",
        "skill/missing-allowed-tools": "warn",
    },
};
