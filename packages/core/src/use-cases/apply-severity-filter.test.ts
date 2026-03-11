/**
 * Tests for shared severity filtering logic.
 * Validates that applySeverityFilter correctly maps rule severities,
 * filters diagnostics, and handles instruction quality suggestions.
 */

import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { InstructionQualityResult } from "../entities/instruction-quality.js";
import type { LintDiagnostic, LintOutput } from "../entities/lint.js";
import type { LintRulesConfig } from "../entities/lint-rules.js";
import { DEFAULT_LINT_RULES } from "../entities/lint-rules.js";
import { applySeverityFilter } from "./apply-severity-filter.js";

const chance = new Chance();

function buildDiagnostic(
    overrides: Partial<LintDiagnostic> = {},
): LintDiagnostic {
    return {
        filePath: `.github/skills/${chance.word()}/SKILL.md`,
        line: chance.integer({ min: 1, max: 100 }),
        severity: "error",
        message: chance.sentence(),
        target: "skill",
        ...overrides,
    };
}

function buildLintOutput(overrides: Partial<LintOutput> = {}): LintOutput {
    return {
        diagnostics: [],
        target: "skill",
        filesAnalyzed: [],
        summary: {
            totalFiles: 0,
            totalErrors: 0,
            totalWarnings: 0,
            totalInfos: 0,
        },
        ...overrides,
    };
}

function buildRulesConfig(
    overrides: Partial<LintRulesConfig> = {},
): LintRulesConfig {
    return {
        ...DEFAULT_LINT_RULES,
        ...overrides,
    };
}

describe("Severity filter", () => {
    describe("given diagnostics with no rule IDs", () => {
        it("should pass through unchanged", () => {
            // Arrange
            const diagnostic = buildDiagnostic({ ruleId: undefined });
            const output = buildLintOutput({
                diagnostics: [diagnostic],
                summary: {
                    totalFiles: 1,
                    totalErrors: 1,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig();

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.diagnostics).toHaveLength(1);
            expect(result.diagnostics[0]).toEqual(diagnostic);
        });
    });

    describe("given a diagnostic with a rule configured as off", () => {
        it("should drop the diagnostic", () => {
            // Arrange
            const ruleId = "skill/missing-name";
            const diagnostic = buildDiagnostic({
                ruleId,
                severity: "error",
                target: "skill",
            });
            const output = buildLintOutput({
                diagnostics: [diagnostic],
                target: "skill",
                summary: {
                    totalFiles: 1,
                    totalErrors: 1,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig({
                skills: { ...DEFAULT_LINT_RULES.skills, [ruleId]: "off" },
            });

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.diagnostics).toHaveLength(0);
        });
    });

    describe("given a diagnostic with a rule configured as warn", () => {
        it("should remap severity to warning", () => {
            // Arrange
            const ruleId = "skill/missing-name";
            const diagnostic = buildDiagnostic({
                ruleId,
                severity: "error",
                target: "skill",
            });
            const output = buildLintOutput({
                diagnostics: [diagnostic],
                target: "skill",
                summary: {
                    totalFiles: 1,
                    totalErrors: 1,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig({
                skills: { ...DEFAULT_LINT_RULES.skills, [ruleId]: "warn" },
            });

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.diagnostics).toHaveLength(1);
            expect(result.diagnostics[0].severity).toBe("warning");
        });
    });

    describe("given a diagnostic with a rule configured as error", () => {
        it("should keep severity as error", () => {
            // Arrange
            const ruleId = "skill/missing-name";
            const diagnostic = buildDiagnostic({
                ruleId,
                severity: "warning",
                target: "skill",
            });
            const output = buildLintOutput({
                diagnostics: [diagnostic],
                target: "skill",
                summary: {
                    totalFiles: 1,
                    totalErrors: 0,
                    totalWarnings: 1,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig({
                skills: { ...DEFAULT_LINT_RULES.skills, [ruleId]: "error" },
            });

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.diagnostics).toHaveLength(1);
            expect(result.diagnostics[0].severity).toBe("error");
        });
    });

    describe("given a diagnostic with an unknown rule ID", () => {
        it("should pass through unchanged", () => {
            // Arrange
            const diagnostic = buildDiagnostic({
                ruleId: "skill/unknown-rule",
                target: "skill",
            });
            const output = buildLintOutput({
                diagnostics: [diagnostic],
                target: "skill",
                summary: {
                    totalFiles: 1,
                    totalErrors: 1,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig();

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.diagnostics).toHaveLength(1);
            expect(result.diagnostics[0]).toEqual(diagnostic);
        });
    });

    describe("given mixed diagnostics across severities", () => {
        it("should recalculate summary counts after filtering", () => {
            // Arrange
            const diagnostics = [
                buildDiagnostic({
                    ruleId: "skill/missing-name",
                    severity: "error",
                    target: "skill",
                }),
                buildDiagnostic({
                    ruleId: "skill/missing-description",
                    severity: "error",
                    target: "skill",
                }),
                buildDiagnostic({
                    ruleId: "skill/missing-allowed-tools",
                    severity: "warning",
                    target: "skill",
                }),
            ];
            const output = buildLintOutput({
                diagnostics,
                target: "skill",
                summary: {
                    totalFiles: 1,
                    totalErrors: 2,
                    totalWarnings: 1,
                    totalInfos: 0,
                },
            });
            // Turn missing-name to "off", missing-description to "warn"
            const rules = buildRulesConfig({
                skills: {
                    ...DEFAULT_LINT_RULES.skills,
                    "skill/missing-name": "off",
                    "skill/missing-description": "warn",
                },
            });

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.diagnostics).toHaveLength(2);
            expect(result.summary.totalErrors).toBe(0);
            expect(result.summary.totalWarnings).toBe(2);
            expect(result.summary.totalInfos).toBe(0);
        });
    });

    describe("given an agent target", () => {
        it("should use the agents rules config", () => {
            // Arrange
            const ruleId = "agent/missing-name";
            const diagnostic = buildDiagnostic({
                ruleId,
                severity: "error",
                target: "agent",
            });
            const output = buildLintOutput({
                diagnostics: [diagnostic],
                target: "agent",
                summary: {
                    totalFiles: 1,
                    totalErrors: 1,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig({
                agents: { ...DEFAULT_LINT_RULES.agents, [ruleId]: "off" },
            });

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.diagnostics).toHaveLength(0);
        });
    });

    describe("given an instruction target with quality result", () => {
        it("should filter suggestions whose rule is configured as off", () => {
            // Arrange
            const qualityResult: InstructionQualityResult = {
                discoveredFiles: [],
                commandScores: [],
                overallQualityScore: 50,
                suggestions: [
                    {
                        message: "Command not in code block",
                        ruleId: "instruction/command-not-in-code-block",
                    },
                    {
                        message: "Missing error handling",
                        ruleId: "instruction/missing-error-handling",
                    },
                    {
                        message: "General suggestion without rule",
                    },
                ],
                parsingErrors: [],
            };
            const output = buildLintOutput({
                diagnostics: [],
                target: "instruction",
                qualityResult,
                summary: {
                    totalFiles: 1,
                    totalErrors: 0,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig({
                instructions: {
                    ...DEFAULT_LINT_RULES.instructions,
                    "instruction/command-not-in-code-block": "off",
                },
            });

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.qualityResult?.suggestions).toHaveLength(2);
            expect(result.qualityResult?.suggestions[0].message).toBe(
                "Missing error handling",
            );
            expect(result.qualityResult?.suggestions[1].message).toBe(
                "General suggestion without rule",
            );
        });

        it("should pass through suggestions without a ruleId", () => {
            // Arrange
            const qualityResult: InstructionQualityResult = {
                discoveredFiles: [],
                commandScores: [],
                overallQualityScore: 50,
                suggestions: [{ message: "A general tip" }],
                parsingErrors: [],
            };
            const output = buildLintOutput({
                diagnostics: [],
                target: "instruction",
                qualityResult,
                summary: {
                    totalFiles: 1,
                    totalErrors: 0,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig();

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.qualityResult?.suggestions).toHaveLength(1);
        });
    });

    describe("given a non-instruction target with quality result", () => {
        it("should not filter quality result suggestions", () => {
            // Arrange
            const qualityResult: InstructionQualityResult = {
                discoveredFiles: [],
                commandScores: [],
                overallQualityScore: 50,
                suggestions: [
                    {
                        message: "Some suggestion",
                        ruleId: "instruction/command-not-in-code-block",
                    },
                ],
                parsingErrors: [],
            };
            const output = buildLintOutput({
                diagnostics: [],
                target: "skill",
                qualityResult,
                summary: {
                    totalFiles: 1,
                    totalErrors: 0,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig({
                instructions: {
                    ...DEFAULT_LINT_RULES.instructions,
                    "instruction/command-not-in-code-block": "off",
                },
            });

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.qualityResult?.suggestions).toHaveLength(1);
        });
    });

    describe("given no diagnostics", () => {
        it("should return an empty output with zero counts", () => {
            // Arrange
            const output = buildLintOutput({
                target: "skill",
                summary: {
                    totalFiles: 0,
                    totalErrors: 0,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig();

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.diagnostics).toHaveLength(0);
            expect(result.summary.totalErrors).toBe(0);
            expect(result.summary.totalWarnings).toBe(0);
            expect(result.summary.totalInfos).toBe(0);
        });
    });

    describe("given output preserves non-filtered fields", () => {
        it("should keep filesAnalyzed and target unchanged", () => {
            // Arrange
            const filesAnalyzed = [chance.word(), chance.word()];
            const output = buildLintOutput({
                target: "agent",
                filesAnalyzed,
                summary: {
                    totalFiles: 2,
                    totalErrors: 0,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            });
            const rules = buildRulesConfig();

            // Act
            const result = applySeverityFilter(output, rules);

            // Assert
            expect(result.target).toBe("agent");
            expect(result.filesAnalyzed).toEqual(filesAnalyzed);
            expect(result.summary.totalFiles).toBe(2);
        });
    });
});
