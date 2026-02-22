import Chance from "chance";
import { describe, expect, it } from "vitest";
import type {
    CopilotReviewStatus,
    Ruleset,
    RulesetRule,
} from "../entities/copilot-setup.js";
import {
    buildCopilotReviewRulesetPayload,
    checkCopilotReviewRuleset,
    hasCopilotReviewRule,
    type RulesetGateway,
} from "./check-copilot-review-ruleset.js";

const chance = new Chance();

function createMockGateway(
    overrides: Partial<RulesetGateway> = {},
): RulesetGateway {
    return {
        listRulesets: overrides.listRulesets ?? (() => Promise.resolve([])),
        createRuleset:
            overrides.createRuleset ?? (() => Promise.resolve(undefined)),
    };
}

/**
 * Builds a copilot_code_review rule with review parameters.
 * Uses GitHub API snake_case field names.
 */
function buildCopilotCodeReviewRule(): RulesetRule {
    return {
        type: "copilot_code_review",
        parameters: {
            // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
            review_on_push: true,
            // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
            review_draft_pull_requests: true,
        },
    };
}

/**
 * Builds a code_scanning rule with the specified tool name.
 * Uses GitHub API snake_case field names.
 */
function buildCodeScanningRule(toolName: string): RulesetRule {
    return {
        type: "code_scanning",
        parameters: {
            // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
            code_scanning_tools: [
                {
                    tool: toolName,
                    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                    security_alerts_threshold: "high_or_higher",
                    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                    alerts_threshold: "errors",
                },
            ],
        },
    };
}

/**
 * Builds a ruleset with the given rules.
 */
function buildRuleset(rules?: RulesetRule[]): Ruleset {
    return {
        id: chance.natural(),
        name: chance.word(),
        enforcement: "active",
        rules,
    };
}

describe("Check Copilot Review Ruleset", () => {
    describe("hasCopilotReviewRule", () => {
        describe("when a ruleset contains a copilot_code_review rule", () => {
            it("should return true", () => {
                // Arrange
                const rulesets: Ruleset[] = [
                    buildRuleset([buildCopilotCodeReviewRule()]),
                ];

                // Act
                const result = hasCopilotReviewRule(rulesets);

                // Assert
                expect(result).toBe(true);
            });
        });

        describe("when a ruleset contains a code_scanning rule with Copilot Autofix tool", () => {
            it("should return true", () => {
                // Arrange
                const rulesets: Ruleset[] = [
                    buildRuleset([buildCodeScanningRule("Copilot Autofix")]),
                ];

                // Act
                const result = hasCopilotReviewRule(rulesets);

                // Assert
                expect(result).toBe(true);
            });
        });

        describe("when a ruleset contains a code_scanning rule with copilot tool (case insensitive)", () => {
            it("should return true", () => {
                // Arrange
                const rulesets: Ruleset[] = [
                    buildRuleset([buildCodeScanningRule("copilot autofix")]),
                ];

                // Act
                const result = hasCopilotReviewRule(rulesets);

                // Assert
                expect(result).toBe(true);
            });
        });

        describe("when no rulesets contain a Copilot tool", () => {
            it("should return false", () => {
                // Arrange
                const rulesets: Ruleset[] = [
                    buildRuleset([buildCodeScanningRule("CodeQL")]),
                ];

                // Act
                const result = hasCopilotReviewRule(rulesets);

                // Assert
                expect(result).toBe(false);
            });
        });

        describe("when rulesets array is empty", () => {
            it("should return false", () => {
                // Act
                const result = hasCopilotReviewRule([]);

                // Assert
                expect(result).toBe(false);
            });
        });

        describe("when rulesets have no rules", () => {
            it("should return false", () => {
                // Arrange
                const rulesets: Ruleset[] = [buildRuleset()];

                // Act
                const result = hasCopilotReviewRule(rulesets);

                // Assert
                expect(result).toBe(false);
            });
        });

        describe("when rulesets have non-code_scanning rules", () => {
            it("should return false", () => {
                // Arrange
                const rulesets: Ruleset[] = [
                    buildRuleset([
                        {
                            type: "pull_request",
                            parameters: {
                                // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                                required_approving_review_count: 1,
                            },
                        },
                    ]),
                ];

                // Act
                const result = hasCopilotReviewRule(rulesets);

                // Assert
                expect(result).toBe(false);
            });
        });
    });

    describe("buildCopilotReviewRulesetPayload", () => {
        it("should return a valid ruleset payload", () => {
            // Act
            const result = buildCopilotReviewRulesetPayload();

            // Assert
            expect(result.name).toBe("Copilot Code Review");
            expect(result.enforcement).toBe("active");
            expect(result.rules).toHaveLength(2);
            expect(result.rules[0].type).toBe("copilot_code_review");
            expect(result.rules[1].type).toBe("code_scanning");
        });

        it("should include copilot_code_review rule with review parameters", () => {
            // Act
            const result = buildCopilotReviewRulesetPayload();

            // Assert
            const rule = result.rules[0];
            const params = rule.parameters as Record<string, unknown>;
            expect(params.review_on_push).toBe(true);
            expect(params.review_draft_pull_requests).toBe(true);
        });

        it("should include Copilot Autofix in code_scanning_tools", () => {
            // Act
            const result = buildCopilotReviewRulesetPayload();

            // Assert
            const rule = result.rules[1];
            const params = rule.parameters as Record<string, unknown>;
            const tools = params.code_scanning_tools as Array<{
                tool: string;
            }>;
            expect(tools).toContainEqual(
                expect.objectContaining({ tool: "Copilot Autofix" }),
            );
        });
    });

    describe("checkCopilotReviewRuleset", () => {
        describe("when a Copilot review ruleset exists", () => {
            it("should return status with hasRuleset true and the ruleset name", async () => {
                // Arrange
                const rulesetName = chance.word();
                const copilotRuleset = buildRuleset([
                    buildCodeScanningRule("Copilot Autofix"),
                ]);
                copilotRuleset.name = rulesetName;
                const gateway = createMockGateway({
                    listRulesets: () => Promise.resolve([copilotRuleset]),
                });
                const owner = chance.word();
                const repo = chance.word();

                // Act
                const result = await checkCopilotReviewRuleset(
                    gateway,
                    owner,
                    repo,
                );

                // Assert
                expect(result).toEqual<CopilotReviewStatus>({
                    hasRuleset: true,
                    rulesetName,
                });
            });
        });

        describe("when no Copilot review ruleset exists", () => {
            it("should return status with hasRuleset false", async () => {
                // Arrange
                const gateway = createMockGateway({
                    listRulesets: () => Promise.resolve([]),
                });
                const owner = chance.word();
                const repo = chance.word();

                // Act
                const result = await checkCopilotReviewRuleset(
                    gateway,
                    owner,
                    repo,
                );

                // Assert
                expect(result).toEqual<CopilotReviewStatus>({
                    hasRuleset: false,
                });
            });
        });

        describe("when the gateway throws an error", () => {
            it("should return status with error message", async () => {
                // Arrange
                const errorMessage = chance.sentence();
                const gateway = createMockGateway({
                    listRulesets: () => Promise.reject(new Error(errorMessage)),
                });
                const owner = chance.word();
                const repo = chance.word();

                // Act
                const result = await checkCopilotReviewRuleset(
                    gateway,
                    owner,
                    repo,
                );

                // Assert
                expect(result).toEqual<CopilotReviewStatus>({
                    hasRuleset: false,
                    error: errorMessage,
                });
            });
        });
    });
});
