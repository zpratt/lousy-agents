import Chance from "chance";
import { describe, expect, it } from "vitest";
import { generateSkillContent, normalizeSkillName } from "./skill.js";

const chance = new Chance();

describe("Skill entity", () => {
    describe("normalizeSkillName", () => {
        describe("given a name with spaces", () => {
            it("should convert to lowercase with hyphens", () => {
                // Arrange
                const input = "Test Specialist";

                // Act
                const result = normalizeSkillName(input);

                // Assert
                expect(result).toBe("test-specialist");
            });
        });

        describe("given a name with mixed case", () => {
            it("should convert to lowercase", () => {
                // Arrange
                const input = "Debugging";

                // Act
                const result = normalizeSkillName(input);

                // Assert
                expect(result).toBe("debugging");
            });
        });

        describe("given a name with multiple spaces", () => {
            it("should collapse to single hyphens", () => {
                // Arrange
                const input = "GitHub   Actions   Debug";

                // Act
                const result = normalizeSkillName(input);

                // Assert
                expect(result).toBe("github-actions-debug");
            });
        });

        describe("given a name with leading or trailing spaces", () => {
            it("should trim the spaces", () => {
                // Arrange
                const input = "  Workflow Debugging  ";

                // Act
                const result = normalizeSkillName(input);

                // Assert
                expect(result).toBe("workflow-debugging");
            });
        });

        describe("given a name already in kebab-case", () => {
            it("should return unchanged", () => {
                // Arrange
                const input = "github-actions-debug";

                // Act
                const result = normalizeSkillName(input);

                // Assert
                expect(result).toBe("github-actions-debug");
            });
        });

        describe("given an empty name", () => {
            it("should return empty string", () => {
                // Arrange
                const input = "";

                // Act
                const result = normalizeSkillName(input);

                // Assert
                expect(result).toBe("");
            });
        });
    });

    describe("generateSkillContent", () => {
        describe("given a valid skill name", () => {
            it("should generate markdown with YAML frontmatter", () => {
                // Arrange
                const skillName = chance.word();

                // Act
                const result = generateSkillContent(skillName);

                // Assert
                expect(result).toContain("---");
                expect(result).toContain("name:");
                expect(result).toContain("description:");
            });

            it("should include the skill name in frontmatter", () => {
                // Arrange
                const skillName = "github-actions-debug";

                // Act
                const result = generateSkillContent(skillName);

                // Assert
                expect(result).toContain("name: github-actions-debug");
            });

            it("should include a description placeholder", () => {
                // Arrange
                const skillName = chance.word();

                // Act
                const result = generateSkillContent(skillName);

                // Assert
                expect(result).toMatch(/description: .+/);
            });

            it("should include documentation link comment", () => {
                // Arrange
                const skillName = chance.word();

                // Act
                const result = generateSkillContent(skillName);

                // Assert
                expect(result).toContain(
                    "https://docs.github.com/en/copilot/concepts/agents/about-agent-skills",
                );
            });

            it("should include skill instruction structure", () => {
                // Arrange
                const skillName = chance.word();

                // Act
                const result = generateSkillContent(skillName);

                // Assert
                expect(result).toContain("# ");
                expect(result).toContain("## When to Use This Skill");
                expect(result).toContain("## Instructions");
                expect(result).toContain("## Guidelines");
                expect(result).toContain("## Examples");
            });

            it("should include the skill name in the heading", () => {
                // Arrange
                const skillName = "github-actions-debug";

                // Act
                const result = generateSkillContent(skillName);

                // Assert
                expect(result).toContain("# github-actions-debug");
            });
        });
    });
});
