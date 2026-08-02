import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { ParsedFrontmatter } from "../entities/skill.js";
import {
    type DiscoveredSubagentFile,
    LintSubagentFrontmatterUseCase,
    type SubagentLintGateway,
} from "./lint-subagent-frontmatter.js";

const chance = new Chance();

function createMockGateway(
    overrides: Partial<SubagentLintGateway> = {},
): SubagentLintGateway {
    return {
        discoverSubagents: vi.fn().mockResolvedValue([]),
        readSubagentFileContent: vi.fn().mockResolvedValue(""),
        parseFrontmatter: vi.fn().mockReturnValue(null),
        ...overrides,
    };
}

function buildValidFrontmatter(subagentName: string): ParsedFrontmatter {
    return {
        data: {
            name: subagentName,
            description: chance.sentence(),
        },
        fieldLines: new Map([
            ["name", 2],
            ["description", 3],
        ]),
        frontmatterStartLine: 1,
    };
}

describe("LintSubagentFrontmatterUseCase", () => {
    describe("given no subagents discovered", () => {
        it("should return empty results", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new LintSubagentFrontmatterUseCase(gateway);
            const targetDir = chance.word();

            // Act
            const result = await useCase.execute({ targetDir });

            // Assert
            expect(result.results).toEqual([]);
            expect(result.totalSubagents).toBe(0);
            expect(result.totalErrors).toBe(0);
            expect(result.totalWarnings).toBe(0);
        });
    });

    describe("given a subagent with valid frontmatter", () => {
        it("should return a valid result with no diagnostics", async () => {
            // Arrange
            const subagentName = "reviewer";
            const filePath = `/repo/.claude/agents/${subagentName}.md`;
            const discovered: DiscoveredSubagentFile[] = [
                { filePath, subagentName },
            ];
            const frontmatter = buildValidFrontmatter(subagentName);
            const gateway = createMockGateway({
                discoverSubagents: vi.fn().mockResolvedValue(discovered),
                readSubagentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: reviewer\ndescription: A reviewer subagent\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results).toHaveLength(1);
            expect(result.results[0].valid).toBe(true);
            expect(result.results[0].diagnostics).toHaveLength(0);
        });
    });

    describe("given a subagent with missing name field", () => {
        it("should return an error diagnostic with rule ID subagent/missing-name", async () => {
            // Arrange
            const subagentName = "reviewer";
            const filePath = `/repo/.claude/agents/${subagentName}.md`;
            const discovered: DiscoveredSubagentFile[] = [
                { filePath, subagentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: { description: chance.sentence() },
                fieldLines: new Map([["description", 2]]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSubagents: vi.fn().mockResolvedValue(discovered),
                readSubagentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\ndescription: A reviewer subagent\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const nameDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "subagent/missing-name",
            );
            expect(nameDiag).toBeDefined();
            expect(nameDiag?.severity).toBe("error");
        });
    });

    describe("given a subagent with missing description field", () => {
        it("should return an error diagnostic with rule ID subagent/missing-description", async () => {
            // Arrange
            const subagentName = "reviewer";
            const filePath = `/repo/.claude/agents/${subagentName}.md`;
            const discovered: DiscoveredSubagentFile[] = [
                { filePath, subagentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: { name: subagentName },
                fieldLines: new Map([["name", 2]]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSubagents: vi.fn().mockResolvedValue(discovered),
                readSubagentFileContent: vi
                    .fn()
                    .mockResolvedValue("---\nname: reviewer\n---\n"),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const descDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "subagent/missing-description",
            );
            expect(descDiag).toBeDefined();
            expect(descDiag?.severity).toBe("error");
        });
    });

    describe("given a subagent with name that does not match filename stem", () => {
        it("should return an error diagnostic with rule ID subagent/name-mismatch", async () => {
            // Arrange
            const subagentName = "reviewer";
            const filePath = `/repo/.claude/agents/${subagentName}.md`;
            const discovered: DiscoveredSubagentFile[] = [
                { filePath, subagentName },
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
                discoverSubagents: vi.fn().mockResolvedValue(discovered),
                readSubagentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: different-name\ndescription: A reviewer subagent\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const mismatchDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "subagent/name-mismatch",
            );
            expect(mismatchDiag).toBeDefined();
            expect(mismatchDiag?.severity).toBe("error");
            expect(mismatchDiag?.line).toBe(2);
        });
    });

    describe("given a subagent with invalid name format", () => {
        it("should return an error diagnostic with rule ID subagent/invalid-name-format", async () => {
            // Arrange
            const subagentName = "reviewer";
            const filePath = `/repo/.claude/agents/${subagentName}.md`;
            const discovered: DiscoveredSubagentFile[] = [
                { filePath, subagentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: { name: "Reviewer", description: chance.sentence() },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSubagents: vi.fn().mockResolvedValue(discovered),
                readSubagentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        '---\nname: Reviewer\ndescription: "A reviewer subagent"\n---\n',
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const nameDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "subagent/invalid-name-format",
            );
            expect(nameDiag).toBeDefined();
            expect(nameDiag?.severity).toBe("error");
        });
    });

    describe("given a subagent with a name field present but of the wrong type", () => {
        it("should return an error diagnostic with rule ID subagent/invalid-name-format, not subagent/missing-name", async () => {
            // Arrange
            const subagentName = "reviewer";
            const filePath = `/repo/.claude/agents/${subagentName}.md`;
            const discovered: DiscoveredSubagentFile[] = [
                { filePath, subagentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: { name: 123, description: chance.sentence() },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSubagents: vi.fn().mockResolvedValue(discovered),
                readSubagentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        '---\nname: 123\ndescription: "A reviewer subagent"\n---\n',
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const diagnostics = result.results[0].diagnostics;
            expect(
                diagnostics.some(
                    (d) => d.ruleId === "subagent/invalid-name-format",
                ),
            ).toBe(true);
            expect(
                diagnostics.some((d) => d.ruleId === "subagent/missing-name"),
            ).toBe(false);
        });
    });

    describe("given a subagent with missing YAML frontmatter", () => {
        it("should return an error diagnostic with rule ID subagent/missing-frontmatter", async () => {
            // Arrange
            const subagentName = "reviewer";
            const filePath = `/repo/.claude/agents/${subagentName}.md`;
            const discovered: DiscoveredSubagentFile[] = [
                { filePath, subagentName },
            ];
            const gateway = createMockGateway({
                discoverSubagents: vi.fn().mockResolvedValue(discovered),
                readSubagentFileContent: vi
                    .fn()
                    .mockResolvedValue("# No frontmatter here\n"),
                parseFrontmatter: vi.fn().mockReturnValue(null),
            });
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            expect(result.results[0].diagnostics).toHaveLength(1);
            expect(result.results[0].diagnostics[0].ruleId).toBe(
                "subagent/missing-frontmatter",
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
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act & Assert
            await expect(useCase.execute({ targetDir: "" })).rejects.toThrow(
                "Target directory is required",
            );
        });
    });

    describe("given a subagent with opening --- but no closing delimiter", () => {
        it("should return an error diagnostic with rule ID subagent/invalid-frontmatter", async () => {
            // Arrange
            const subagentName = "reviewer";
            const filePath = `/repo/.claude/agents/${subagentName}.md`;
            const discovered: DiscoveredSubagentFile[] = [
                { filePath, subagentName },
            ];
            const gateway = createMockGateway({
                discoverSubagents: vi.fn().mockResolvedValue(discovered),
                readSubagentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: reviewer\ndescription: test\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(null),
            });
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            expect(result.results[0].diagnostics).toHaveLength(1);
            expect(result.results[0].diagnostics[0].ruleId).toBe(
                "subagent/invalid-frontmatter",
            );
            expect(result.results[0].diagnostics[0].message).toContain(
                "Invalid YAML frontmatter",
            );
        });
    });

    describe("given a subagent with empty description", () => {
        it("should return an error diagnostic for the empty description", async () => {
            // Arrange
            const subagentName = "reviewer";
            const filePath = `/repo/.claude/agents/${subagentName}.md`;
            const discovered: DiscoveredSubagentFile[] = [
                { filePath, subagentName },
            ];
            const frontmatter: ParsedFrontmatter = {
                data: { name: subagentName, description: "" },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSubagents: vi.fn().mockResolvedValue(discovered),
                readSubagentFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        '---\nname: reviewer\ndescription: ""\n---\n',
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSubagentFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const descDiag = result.results[0].diagnostics.find(
                (d) => d.ruleId === "subagent/invalid-description",
            );
            expect(descDiag).toBeDefined();
        });
    });
});
