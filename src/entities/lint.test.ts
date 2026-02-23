import { describe, expect, it } from "vitest";
import type {
    LintDiagnostic,
    LintOutput,
    LintSeverity,
    LintTarget,
} from "./lint.js";

describe("Lint entity types", () => {
    describe("LintSeverity", () => {
        it("should accept error, warning, and info values", () => {
            // Arrange
            const severities: LintSeverity[] = ["error", "warning", "info"];

            // Assert
            expect(severities).toHaveLength(3);
        });
    });

    describe("LintTarget", () => {
        it("should accept skill, agent, and instruction values", () => {
            // Arrange
            const targets: LintTarget[] = ["skill", "agent", "instruction"];

            // Assert
            expect(targets).toHaveLength(3);
        });
    });

    describe("LintDiagnostic", () => {
        it("should represent a diagnostic with all required fields", () => {
            // Arrange
            const diagnostic: LintDiagnostic = {
                filePath: ".github/skills/my-skill/SKILL.md",
                line: 2,
                severity: "error",
                message: "Name is required",
                target: "skill",
            };

            // Assert
            expect(diagnostic.filePath).toBe(
                ".github/skills/my-skill/SKILL.md",
            );
            expect(diagnostic.line).toBe(2);
            expect(diagnostic.severity).toBe("error");
            expect(diagnostic.message).toBe("Name is required");
            expect(diagnostic.target).toBe("skill");
        });

        it("should support optional fields for range-based diagnostics", () => {
            // Arrange
            const diagnostic: LintDiagnostic = {
                filePath: ".github/agents/security.md",
                line: 2,
                column: 5,
                endLine: 2,
                endColumn: 15,
                severity: "warning",
                message: "Name format invalid",
                ruleId: "agent/invalid-name-format",
                field: "name",
                target: "agent",
            };

            // Assert
            expect(diagnostic.column).toBe(5);
            expect(diagnostic.endLine).toBe(2);
            expect(diagnostic.endColumn).toBe(15);
            expect(diagnostic.ruleId).toBe("agent/invalid-name-format");
            expect(diagnostic.field).toBe("name");
        });
    });

    describe("LintOutput", () => {
        it("should aggregate diagnostics with summary counts", () => {
            // Arrange
            const output: LintOutput = {
                diagnostics: [
                    {
                        filePath: "file.md",
                        line: 1,
                        severity: "error",
                        message: "err",
                        target: "skill",
                    },
                    {
                        filePath: "file.md",
                        line: 2,
                        severity: "warning",
                        message: "warn",
                        target: "skill",
                    },
                    {
                        filePath: "file.md",
                        line: 3,
                        severity: "info",
                        message: "info",
                        target: "skill",
                    },
                ],
                target: "skill",
                filesAnalyzed: ["file.md"],
                summary: {
                    totalFiles: 1,
                    totalErrors: 1,
                    totalWarnings: 1,
                    totalInfos: 1,
                },
            };

            // Assert
            expect(output.diagnostics).toHaveLength(3);
            expect(output.target).toBe("skill");
            expect(output.filesAnalyzed).toEqual(["file.md"]);
            expect(output.summary.totalFiles).toBe(1);
            expect(output.summary.totalErrors).toBe(1);
            expect(output.summary.totalWarnings).toBe(1);
            expect(output.summary.totalInfos).toBe(1);
        });
    });
});
