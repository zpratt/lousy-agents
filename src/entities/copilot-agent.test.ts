import Chance from "chance";
import { describe, expect, it } from "vitest";
import { generateAgentContent, normalizeAgentName } from "./copilot-agent.js";

const chance = new Chance();

describe("CopilotAgent entity", () => {
    describe("normalizeAgentName", () => {
        describe("given a name with spaces", () => {
            it("should convert to lowercase with hyphens", () => {
                // Arrange
                const input = "Test Specialist";

                // Act
                const result = normalizeAgentName(input);

                // Assert
                expect(result).toBe("test-specialist");
            });
        });

        describe("given a name with mixed case", () => {
            it("should convert to lowercase", () => {
                // Arrange
                const input = "Security";

                // Act
                const result = normalizeAgentName(input);

                // Assert
                expect(result).toBe("security");
            });
        });

        describe("given a name with multiple spaces", () => {
            it("should collapse to single hyphens", () => {
                // Arrange
                const input = "Code   Review   Expert";

                // Act
                const result = normalizeAgentName(input);

                // Assert
                expect(result).toBe("code-review-expert");
            });
        });

        describe("given a name with leading or trailing spaces", () => {
            it("should trim the spaces", () => {
                // Arrange
                const input = "  Security Auditor  ";

                // Act
                const result = normalizeAgentName(input);

                // Assert
                expect(result).toBe("security-auditor");
            });
        });

        describe("given a name already in kebab-case", () => {
            it("should return unchanged", () => {
                // Arrange
                const input = "code-reviewer";

                // Act
                const result = normalizeAgentName(input);

                // Assert
                expect(result).toBe("code-reviewer");
            });
        });

        describe("given an empty name", () => {
            it("should return empty string", () => {
                // Arrange
                const input = "";

                // Act
                const result = normalizeAgentName(input);

                // Assert
                expect(result).toBe("");
            });
        });
    });

    describe("generateAgentContent", () => {
        describe("given a valid agent name", () => {
            it("should generate markdown with YAML frontmatter", () => {
                // Arrange
                const agentName = chance.word();

                // Act
                const result = generateAgentContent(agentName);

                // Assert
                expect(result).toContain("---");
                expect(result).toContain("name:");
                expect(result).toContain("description:");
            });

            it("should include the agent name in frontmatter", () => {
                // Arrange
                const agentName = "security";

                // Act
                const result = generateAgentContent(agentName);

                // Assert
                expect(result).toContain("name: security");
            });

            it("should include a description placeholder", () => {
                // Arrange
                const agentName = chance.word();

                // Act
                const result = generateAgentContent(agentName);

                // Assert
                expect(result).toMatch(/description: .+/);
            });

            it("should include documentation link comment", () => {
                // Arrange
                const agentName = chance.word();

                // Act
                const result = generateAgentContent(agentName);

                // Assert
                expect(result).toContain(
                    "https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents",
                );
            });

            it("should include example prompt structure", () => {
                // Arrange
                const agentName = chance.word();

                // Act
                const result = generateAgentContent(agentName);

                // Assert
                expect(result).toContain("# ");
                expect(result).toContain("## Your Role");
                expect(result).toContain("## Responsibilities");
                expect(result).toContain("## Guidelines");
            });

            it("should include the agent name in the heading", () => {
                // Arrange
                const agentName = "code-reviewer";

                // Act
                const result = generateAgentContent(agentName);

                // Assert
                expect(result).toContain("# code-reviewer Agent");
            });
        });
    });
});
