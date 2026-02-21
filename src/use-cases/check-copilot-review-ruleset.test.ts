import Chance from "chance";
import { describe, expect, it } from "vitest";
import type {
    CopilotReviewStatus,
    Ruleset,
} from "../entities/copilot-setup.js";
import {
    type RulesetGateway,
    buildCopilotReviewRulesetPayload,
    checkCopilotReviewRuleset,
    hasCopilotReviewRule,
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

describe("Check Copilot Review Ruleset", () => {
    describe("hasCopilotReviewRule", () => {
        describe("when a ruleset contains a code_scanning rule with Copilot Autofix tool", () => {
            it("should return true", () => {
                // Arrange
                const rulesets: Ruleset[] = [
                    {
                        id: chance.natural(),
                        name: chance.word(),
                        enforcement: "active",
                        rules: [
                            {
                                type: "code_scanning",
                                parameters: {
                                    code_scanning_tools: [
                                        {
                                            tool: "Copilot Autofix",
                                            security_alerts_threshold:
                                                "high_or_higher",
                                            alerts_threshold: "errors",
                                        },
                                    ],
                                },
                            },
                        ],
                    },
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
                    {
                        id: chance.natural(),
                        name: chance.word(),
                        enforcement: "active",
                        rules: [
                            {
                                type: "code_scanning",
                                parameters: {
                                    code_scanning_tools: [
                                        {
                                            tool: "copilot autofix",
                                            security_alerts_threshold:
                                                "high_or_higher",
                                            alerts_threshold: "errors",
                                        },
                                    ],
                                },
                            },
                        ],
                    },
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
                    {
                        id: chance.natural(),
                        name: chance.word(),
                        enforcement: "active",
                        rules: [
                            {
                                type: "code_scanning",
                                parameters: {
                                    code_scanning_tools: [
                                        {
                                            tool: "CodeQL",
                                            security_alerts_threshold:
                                                "high_or_higher",
                                            alerts_threshold: "errors",
                                        },
                                    ],
                                },
                            },
                        ],
                    },
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
                const rulesets: Ruleset[] = [
                    {
                        id: chance.natural(),
                        name: chance.word(),
                        enforcement: "active",
                    },
                ];

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
                    {
                        id: chance.natural(),
                        name: chance.word(),
                        enforcement: "active",
                        rules: [
                            {
                                type: "pull_request",
                                parameters: {
                                    required_approving_review_count: 1,
                                },
                            },
                        ],
                    },
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
            expect(result.rules).toHaveLength(1);
            expect(result.rules[0].type).toBe("code_scanning");
        });

        it("should include Copilot Autofix in code_scanning_tools", () => {
            // Act
            const result = buildCopilotReviewRulesetPayload();

            // Assert
            const rule = result.rules[0];
            const tools = (
                rule.parameters as {
                    code_scanning_tools: Array<{ tool: string }>;
                }
            ).code_scanning_tools;
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
                const gateway = createMockGateway({
                    listRulesets: () =>
                        Promise.resolve([
                            {
                                id: chance.natural(),
                                name: rulesetName,
                                enforcement: "active",
                                rules: [
                                    {
                                        type: "code_scanning",
                                        parameters: {
                                            code_scanning_tools: [
                                                {
                                                    tool: "Copilot Autofix",
                                                    security_alerts_threshold:
                                                        "high_or_higher",
                                                    alerts_threshold: "errors",
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        ]),
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
                    listRulesets: () =>
                        Promise.reject(new Error(errorMessage)),
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
