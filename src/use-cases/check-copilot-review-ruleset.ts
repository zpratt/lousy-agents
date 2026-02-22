import type {
    CopilotReviewStatus,
    Ruleset,
    RulesetRule,
} from "../entities/copilot-setup.js";

export interface RulesetGateway {
    listRulesets(owner: string, repo: string): Promise<Ruleset[]>;
    createRuleset(
        owner: string,
        repo: string,
        payload: RulesetPayload,
    ): Promise<void>;
}

export interface RulesetPayload {
    name: string;
    enforcement: string;
    target: string;
    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
    bypass_actors: Array<Record<string, unknown>>;
    conditions: Record<string, unknown>;
    rules: RulesetRule[];
}

function isCopilotCodeReviewRule(rule: RulesetRule): boolean {
    return rule.type === "copilot_code_review";
}

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
 * Finds the first active ruleset with a copilot_code_review or code_scanning Copilot rule
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
 * Checks if any active ruleset contains a Copilot review rule
 */
export function hasCopilotReviewRule(rulesets: Ruleset[]): boolean {
    return findCopilotRuleset(rulesets) !== undefined;
}

/**
 * Builds a ruleset payload for enabling Copilot code review
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
 * Checks whether a repository has an active Copilot PR review ruleset
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
