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
    readonly subagents: RuleConfigMap;
    readonly hooks: RuleConfigMap;
    readonly instructions: RuleConfigMap;
    readonly skills: RuleConfigMap;
    readonly mcpServers: RuleConfigMap;
}

/** Reported when an instruction file could not be read or parsed. */
export const INSTRUCTION_PARSE_ERROR_RULE_ID = "instruction/parse-error";

/** Reported when instruction discovery stopped at one of its limits. */
export const DISCOVERY_LIMIT_REACHED_RULE_ID =
    "instruction/discovery-limit-reached";

/** Reported when instruction discovery skipped symbolic links that lead outside the repository. */
export const DISCOVERY_SYMLINK_SKIPPED_RULE_ID =
    "instruction/discovery-symlink-skipped";

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
    subagents: {
        "subagent/missing-frontmatter": "error",
        "subagent/invalid-frontmatter": "error",
        "subagent/missing-name": "error",
        // Claude Code's documented subagent contract requires only `name`
        // and `description`; it neither specifies a name format beyond
        // "unique identifier" nor ties `name` to the filename the way
        // VS Code derives a Copilot custom agent's name from
        // `<name>.agent.md`. Defaulting these to "warn" avoids failing
        // lint for subagents that are valid per Claude Code's own docs.
        "subagent/invalid-name-format": "warn",
        "subagent/name-mismatch": "warn",
        "subagent/missing-description": "error",
        "subagent/invalid-description": "error",
        "subagent/invalid-field": "warn",
    },
    mcpServers: {
        "mcpserver/invalid-json": "error",
        "mcpserver/invalid-config": "error",
    },
    hooks: {
        "hook/invalid-json": "error",
        "hook/invalid-config": "error",
        "hook/missing-command": "error",
        "hook/unknown-event": "error",
        "hook/missing-matcher": "warn",
        "hook/missing-timeout": "warn",
    },
    instructions: {
        [INSTRUCTION_PARSE_ERROR_RULE_ID]: "warn",
        "instruction/command-not-in-code-block": "warn",
        "instruction/command-outside-section": "warn",
        "instruction/missing-error-handling": "warn",
        "instruction/missing-structural-heading": "warn",
        "instruction/import-unresolved": "warn",
        "instruction/import-escape": "warn",
        "instruction/import-symlink": "warn",
        "instruction/import-cycle": "warn",
        "instruction/import-depth-exceeded": "warn",
        "instruction/import-size-exceeded": "warn",
        [DISCOVERY_LIMIT_REACHED_RULE_ID]: "warn",
        [DISCOVERY_SYMLINK_SKIPPED_RULE_ID]: "warn",
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
        "skill/missing-argument-hint": "warn",
    },
};

const RUN_LEVEL_RULE_IDS: ReadonlySet<string> = new Set([
    DISCOVERY_LIMIT_REACHED_RULE_ID,
    DISCOVERY_SYMLINK_SKIPPED_RULE_ID,
]);

/**
 * Whether a rule's diagnostics describe the whole run rather than a place in
 * one file, so a reporter that filters by changed file or line (reviewdog's
 * diff filter) would drop them. Reporters surface these some other way. A
 * predicate rather than the set itself, so a caller cannot change which rules
 * count.
 */
export function isRunLevelRuleId(ruleId: string | undefined): boolean {
    return ruleId !== undefined && RUN_LEVEL_RULE_IDS.has(ruleId);
}
