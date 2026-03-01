import { describe, expect, it } from "vitest";
import {
    DEFAULT_LINT_RULES,
    type LintRulesConfig,
    type RuleSeverityConfig,
} from "./lint-rules.js";

describe("Lint rule registry", () => {
    describe("RuleSeverityConfig type", () => {
        it("should accept error, warn, and off values", () => {
            // Arrange
            const severities: RuleSeverityConfig[] = ["error", "warn", "off"];

            // Assert
            expect(severities).toHaveLength(3);
        });
    });

    describe("DEFAULT_LINT_RULES", () => {
        it("should have agents, instructions, and skills targets", () => {
            // Assert
            expect(DEFAULT_LINT_RULES).toHaveProperty("agents");
            expect(DEFAULT_LINT_RULES).toHaveProperty("instructions");
            expect(DEFAULT_LINT_RULES).toHaveProperty("skills");
        });

        it("should contain all known agent rule IDs", () => {
            // Arrange
            const expectedAgentRules = [
                "agent/missing-frontmatter",
                "agent/invalid-frontmatter",
                "agent/missing-name",
                "agent/invalid-name-format",
                "agent/name-mismatch",
                "agent/missing-description",
                "agent/invalid-description",
                "agent/invalid-field",
            ];

            // Assert
            for (const ruleId of expectedAgentRules) {
                expect(DEFAULT_LINT_RULES.agents).toHaveProperty(ruleId);
            }
            expect(Object.keys(DEFAULT_LINT_RULES.agents)).toHaveLength(
                expectedAgentRules.length,
            );
        });

        it("should contain all known instruction rule IDs", () => {
            // Arrange
            const expectedInstructionRules = [
                "instruction/parse-error",
                "instruction/command-not-in-code-block",
                "instruction/command-outside-section",
                "instruction/missing-error-handling",
            ];

            // Assert
            for (const ruleId of expectedInstructionRules) {
                expect(DEFAULT_LINT_RULES.instructions).toHaveProperty(ruleId);
            }
            expect(Object.keys(DEFAULT_LINT_RULES.instructions)).toHaveLength(
                expectedInstructionRules.length,
            );
        });

        it("should contain all known skill rule IDs", () => {
            // Arrange
            const expectedSkillRules = [
                "skill/invalid-frontmatter",
                "skill/missing-frontmatter",
                "skill/missing-name",
                "skill/invalid-name-format",
                "skill/name-mismatch",
                "skill/missing-description",
                "skill/invalid-description",
                "skill/missing-allowed-tools",
            ];

            // Assert
            for (const ruleId of expectedSkillRules) {
                expect(DEFAULT_LINT_RULES.skills).toHaveProperty(ruleId);
            }
            expect(Object.keys(DEFAULT_LINT_RULES.skills)).toHaveLength(
                expectedSkillRules.length,
            );
        });

        it("should default agent/invalid-field to warn", () => {
            // Assert
            expect(DEFAULT_LINT_RULES.agents["agent/invalid-field"]).toBe(
                "warn",
            );
        });

        it("should default all other agent rules to error", () => {
            // Arrange
            const errorRules = Object.entries(DEFAULT_LINT_RULES.agents).filter(
                ([id]) => id !== "agent/invalid-field",
            );

            // Assert
            for (const [_ruleId, severity] of errorRules) {
                expect(severity).toBe("error");
            }
        });

        it("should default all instruction rules to warn", () => {
            // Assert
            for (const [_ruleId, severity] of Object.entries(
                DEFAULT_LINT_RULES.instructions,
            )) {
                expect(severity).toBe("warn");
            }
        });

        it("should default skill/missing-allowed-tools to warn", () => {
            // Assert
            expect(
                DEFAULT_LINT_RULES.skills["skill/missing-allowed-tools"],
            ).toBe("warn");
        });

        it("should default all other skill rules to error", () => {
            // Arrange
            const errorRules = Object.entries(DEFAULT_LINT_RULES.skills).filter(
                ([id]) => id !== "skill/missing-allowed-tools",
            );

            // Assert
            for (const [_ruleId, severity] of errorRules) {
                expect(severity).toBe("error");
            }
        });

        it("should satisfy the LintRulesConfig interface", () => {
            // Arrange
            const config: LintRulesConfig = DEFAULT_LINT_RULES;

            // Assert
            expect(config.agents).toBeDefined();
            expect(config.instructions).toBeDefined();
            expect(config.skills).toBeDefined();
        });

        it("should contain a rule for each recommended skill field", () => {
            // Arrange - recommended fields that produce skill/missing-* ruleIds
            const recommendedFieldRuleIds = ["skill/missing-allowed-tools"];

            // Assert - each recommended field must have a registry entry
            for (const ruleId of recommendedFieldRuleIds) {
                expect(DEFAULT_LINT_RULES.skills).toHaveProperty(ruleId);
            }
        });
    });
});
