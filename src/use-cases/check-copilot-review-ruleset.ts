/**
 * Use case for checking and managing Copilot PR review rulesets.
 * This module contains the business logic for detecting whether a repository
 * has a Copilot code review ruleset configured and building new rulesets.
 */

import type {
    CopilotReviewStatus,
    Ruleset,
    RulesetRule,
} from "../entities/copilot-setup.js";

/**
 * Port interface for interacting with GitHub rulesets.
 * Implementations may use the GitHub CLI, REST API, or mocks.
 */
export interface RulesetGateway {
    /**
     * Lists all rulesets for a repository
     * @param owner Repository owner
     * @param repo Repository name
     * @returns Array of rulesets
     */
    listRulesets(owner: string, repo: string): Promise<Ruleset[]>;

    /**
     * Creates a new ruleset for a repository
     * @param owner Repository owner
     * @param repo Repository name
     * @param payload The ruleset configuration to create
     */
    createRuleset(
        owner: string,
        repo: string,
        payload: RulesetPayload,
    ): Promise<void>;
}

/**
 * Payload for creating a new ruleset
 */
export interface RulesetPayload {
    name: string;
    enforcement: string;
    target: string;
    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
    bypass_actors: Array<Record<string, unknown>>;
    conditions: Record<string, unknown>;
    rules: RulesetRule[];
}

/**
 * Checks if a rule is a copilot_code_review rule type
 */
function isCopilotCodeReviewRule(rule: RulesetRule): boolean {
    return rule.type === "copilot_code_review";
}

/**
 * Checks if a rule is a code_scanning rule with a Copilot tool
 */
function isCopilotCodeScanningRule(rule: RulesetRule): boolean {
    if (rule.type !== "code_scanning" || !rule.parameters) {
        return false;
    }

    const tools = rule.parameters.code_scanning_tools;
    if (!Array.isArray(tools)) {
        return false;
    }

    return tools.some(
        (tool) =>
            tool &&
            typeof tool === "object" &&
            typeof tool.tool === "string" &&
            tool.tool.toLowerCase().includes("copilot"),
    );
}

/**
 * Finds the first active ruleset that contains a copilot_code_review rule
 * or a code_scanning rule with a Copilot tool.
 * Only considers rulesets with "active" enforcement.
 * @param rulesets Array of repository rulesets to search
 * @returns The matching ruleset or undefined if not found
 */
function findCopilotRuleset(rulesets: Ruleset[]): Ruleset | undefined {
    for (const ruleset of rulesets) {
        if (!ruleset.rules || ruleset.enforcement !== "active") {
            continue;
        }

        for (const rule of ruleset.rules) {
            if (
                isCopilotCodeReviewRule(rule) ||
                isCopilotCodeScanningRule(rule)
            ) {
                return ruleset;
            }
        }
    }

    return undefined;
}

/**
 * Checks if any active ruleset contains a copilot_code_review rule
 * or a code_scanning rule with a Copilot tool
 * @param rulesets Array of repository rulesets to check
 * @returns True if an active Copilot review rule is found
 */
export function hasCopilotReviewRule(rulesets: Ruleset[]): boolean {
    return findCopilotRuleset(rulesets) !== undefined;
}

/**
 * Builds a ruleset payload for enabling Copilot code review
 * @returns A structured ruleset payload ready to be sent to the GitHub API
 */
export function buildCopilotReviewRulesetPayload(): RulesetPayload {
    return {
        name: "Copilot Code Review",
        enforcement: "active",
        target: "branch",
        // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
        bypass_actors: [],
        conditions: {
            // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
            ref_name: {
                include: ["~DEFAULT_BRANCH"],
                exclude: [],
            },
        },
        rules: [
            {
                type: "copilot_code_review",
                parameters: {
                    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                    review_on_push: true,
                    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                    review_draft_pull_requests: true,
                },
            },
            {
                type: "code_scanning",
                parameters: {
                    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                    code_scanning_tools: [
                        {
                            tool: "Copilot Autofix",
                            // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                            security_alerts_threshold: "high_or_higher",
                            // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                            alerts_threshold: "errors",
                        },
                    ],
                },
            },
        ],
    };
}

/**
 * Checks whether a repository has a Copilot PR review ruleset configured
 * @param gateway Gateway for interacting with GitHub rulesets API
 * @param owner Repository owner
 * @param repo Repository name
 * @returns Status indicating whether a Copilot review ruleset exists
 */
export async function checkCopilotReviewRuleset(
    gateway: RulesetGateway,
    owner: string,
    repo: string,
): Promise<CopilotReviewStatus> {
    try {
        const rulesets = await gateway.listRulesets(owner, repo);
        const copilotRuleset = findCopilotRuleset(rulesets);

        if (copilotRuleset) {
            return {
                hasRuleset: true,
                rulesetName: copilotRuleset.name,
            };
        }

        return { hasRuleset: false };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error";
        return { hasRuleset: false, error: message };
    }
}
