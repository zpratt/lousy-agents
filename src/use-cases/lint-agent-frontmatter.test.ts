import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { ParsedFrontmatter } from "../entities/skill.js";
import {
    type AgentLintGateway,
    type DiscoveredAgentFile,
    LintAgentFrontmatterUseCase,
} from "./lint-agent-frontmatter.js";

const chance = new Chance();

function createMockGateway(
    overrides: Partial<AgentLintGateway> = {},
): AgentLintGateway {
    return {
        discoverAgents: vi.fn().mockResolvedValue([]),
        readAgentFileContent: vi.fn().mockResolvedValue(""),
        parseFrontmatter: vi.fn().mockReturnValue(null),
        ...overrides,
    };
}

function buildValidFrontmatter(agentName: string): ParsedFrontmatter {
    return {
        data: {
            name: agentName,
            description: chance.sentence(),
        },
        fieldLines: new Map([
            ["name", 2],
            ["description", 3],
        ]),
        frontmatterStartLine: 1,
    };
}

describe("LintAgentFrontmatterUseCase", () => {
    describe("given no agents discovered", () => {
        it("should return empty results", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new LintAgentFrontmatterUseCase(gateway);
            const targetDir = chance.word();

            // Act
            const result = await useCase.execute({ targetDir });

            // Assert
            expect(result.results).toEqual([]);
            expect(result.totalAgents).toBe(0);
            expect(result.totalErrors).toBe(0);
            expect(result.totalWarnings).toBe(0);
        });
    });

    describe("given an agent with valid frontmatter", () => {
        it("should return a valid result with no diagnostics", async () => {
            // Arrange
            const agentName = "security";
            const filePath = `/repo/.github/agents/${agentName}.md`;
            const discovered: DiscoveredAgentFile[] = [
                { filePath, agentName },
            ];
            const frontmatter = buildValidFrontmatter(agentName);
            const gateway = createMockGateway({
                discoverAgents: vi.fn().mockResolvedValue(discovered),
                readAgentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: security\ndescription: A security agent\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintAgentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results).toHaveLength(1);
            expect(result.results[0].valid).toBe(true);
            expect(result.results[0].diagnostics).toHaveLength(0);
        });
    });

    describe("given an agent with missing name field", () => {
        it("should return an error diagnostic with rule ID agent/missing-name", async () => {
            // Arrange
            const agentName = "security";
            const filePath = `/repo/.github/agents/${agentName}.md`;
            const discovered: DiscoveredAgentFile[] = [
                { filePath, agentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: { description: chance.sentence() },
                fieldLines: new Map([["description", 2]]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverAgents: vi.fn().mockResolvedValue(discovered),
                readAgentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\ndescription: A security agent\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintAgentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const nameDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "agent/missing-name",
            );
            expect(nameDiag).toBeDefined();
            expect(nameDiag?.severity).toBe("error");
        });
    });

    describe("given an agent with missing description field", () => {
        it("should return an error diagnostic with rule ID agent/missing-description", async () => {
            // Arrange
            const agentName = "security";
            const filePath = `/repo/.github/agents/${agentName}.md`;
            const discovered: DiscoveredAgentFile[] = [
                { filePath, agentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: { name: agentName },
                fieldLines: new Map([["name", 2]]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverAgents: vi.fn().mockResolvedValue(discovered),
                readAgentFileContent: vi
                    .fn()
                    .mockResolvedValue("---\nname: security\n---\n"),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintAgentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const descDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "agent/missing-description",
            );
            expect(descDiag).toBeDefined();
            expect(descDiag?.severity).toBe("error");
        });
    });

    describe("given an agent with name that does not match filename stem", () => {
        it("should return an error diagnostic with rule ID agent/name-mismatch", async () => {
            // Arrange
            const agentName = "security";
            const filePath = `/repo/.github/agents/${agentName}.md`;
            const discovered: DiscoveredAgentFile[] = [
                { filePath, agentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: {
                    name: "different-name",
                    description: chance.sentence(),
                },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverAgents: vi.fn().mockResolvedValue(discovered),
                readAgentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: different-name\ndescription: A security agent\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintAgentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const mismatchDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "agent/name-mismatch",
            );
            expect(mismatchDiag).toBeDefined();
            expect(mismatchDiag?.severity).toBe("error");
            expect(mismatchDiag?.line).toBe(2);
        });
    });

    describe("given an agent with invalid name format", () => {
        it("should return an error diagnostic with rule ID agent/invalid-name-format", async () => {
            // Arrange
            const agentName = "security";
            const filePath = `/repo/.github/agents/${agentName}.md`;
            const discovered: DiscoveredAgentFile[] = [
                { filePath, agentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: { name: "Security", description: chance.sentence() },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverAgents: vi.fn().mockResolvedValue(discovered),
                readAgentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        '---\nname: Security\ndescription: "A security agent"\n---\n',
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintAgentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const nameDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "agent/invalid-name-format",
            );
            expect(nameDiag).toBeDefined();
            expect(nameDiag?.severity).toBe("error");
        });
    });

    describe("given an agent with missing YAML frontmatter", () => {
        it("should return an error diagnostic with rule ID agent/missing-frontmatter", async () => {
            // Arrange
            const agentName = "security";
            const filePath = `/repo/.github/agents/${agentName}.md`;
            const discovered: DiscoveredAgentFile[] = [
                { filePath, agentName },
            ];
            const gateway = createMockGateway({
                discoverAgents: vi.fn().mockResolvedValue(discovered),
                readAgentFileContent: vi
                    .fn()
                    .mockResolvedValue("# No frontmatter here\n"),
                parseFrontmatter: vi.fn().mockReturnValue(null),
            });
            const useCase = new LintAgentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            expect(result.results[0].diagnostics).toHaveLength(1);
            expect(result.results[0].diagnostics[0].ruleId).toBe(
                "agent/missing-frontmatter",
            );
            expect(result.results[0].diagnostics[0].message).toContain(
                "Missing YAML frontmatter",
            );
        });
    });

    describe("given an empty target directory", () => {
        it("should throw an error", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new LintAgentFrontmatterUseCase(gateway);

            // Act & Assert
            await expect(useCase.execute({ targetDir: "" })).rejects.toThrow(
                "Target directory is required",
            );
        });
    });

    describe("given an agent with empty description", () => {
        it("should return an error diagnostic for the empty description", async () => {
            // Arrange
            const agentName = "security";
            const filePath = `/repo/.github/agents/${agentName}.md`;
            const discovered: DiscoveredAgentFile[] = [
                { filePath, agentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: { name: agentName, description: "" },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverAgents: vi.fn().mockResolvedValue(discovered),
                readAgentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        '---\nname: security\ndescription: ""\n---\n',
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintAgentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const descDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "agent/missing-description",
            );
            expect(descDiag).toBeDefined();
        });
    });
});
