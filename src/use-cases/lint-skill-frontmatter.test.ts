import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type {
    DiscoveredSkillFile,
    ParsedFrontmatter,
} from "../entities/skill.js";
import {
    LintSkillFrontmatterUseCase,
    type SkillLintGateway,
} from "./lint-skill-frontmatter.js";

const chance = new Chance();

function createMockGateway(
    overrides: Partial<SkillLintGateway> = {},
): SkillLintGateway {
    return {
        discoverSkills: vi.fn().mockResolvedValue([]),
        readSkillFileContent: vi.fn().mockResolvedValue(""),
        parseFrontmatter: vi.fn().mockReturnValue(null),
        ...overrides,
    };
}

function buildValidFrontmatter(skillName: string): ParsedFrontmatter {
    return {
        data: {
            name: skillName,
            description: chance.sentence(),
        },
        fieldLines: new Map([
            ["name", 2],
            ["description", 3],
        ]),
        frontmatterStartLine: 1,
    };
}

describe("LintSkillFrontmatterUseCase", () => {
    describe("given no skills discovered", () => {
        it("should return empty results", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new LintSkillFrontmatterUseCase(gateway);
            const targetDir = chance.word();

            // Act
            const result = await useCase.execute({ targetDir });

            // Assert
            expect(result.results).toEqual([]);
            expect(result.totalSkills).toBe(0);
            expect(result.totalErrors).toBe(0);
            expect(result.totalWarnings).toBe(0);
        });
    });

    describe("given a skill with valid frontmatter including recommended fields", () => {
        it("should return a valid result with no diagnostics", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
            const frontmatter: ParsedFrontmatter = {
                data: {
                    name: skillName,
                    description: chance.sentence(),
                    "allowed-tools": "tool1, tool2",
                },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                    ["allowed-tools", 4],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: my-skill\ndescription: A skill\nallowed-tools: tool1, tool2\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results).toHaveLength(1);
            expect(result.results[0].valid).toBe(true);
            expect(result.results[0].diagnostics).toHaveLength(0);
        });
    });

    describe("given a skill with valid required fields but missing recommended fields", () => {
        it("should return valid with warning diagnostics only", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
            const frontmatter = buildValidFrontmatter(skillName);
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: my-skill\ndescription: A skill\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(true);
            const errors = result.results[0].diagnostics.filter(
                (d) => d.severity === "error",
            );
            expect(errors).toHaveLength(0);
        });
    });

    describe("given a skill with missing name field", () => {
        it("should return an error diagnostic for the missing name", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
            const frontmatter: ParsedFrontmatter = {
                data: { description: chance.sentence() },
                fieldLines: new Map([["description", 2]]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue("---\ndescription: A skill\n---\n"),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const nameDiagnostic = result.results[0].diagnostics.find(
                (d) => d.field === "name",
            );
            expect(nameDiagnostic).toBeDefined();
            expect(nameDiagnostic?.severity).toBe("error");
            expect(nameDiagnostic?.line).toBe(1);
        });
    });

    describe("given a skill with missing description field", () => {
        it("should return an error diagnostic for the missing description", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
            const frontmatter: ParsedFrontmatter = {
                data: { name: skillName },
                fieldLines: new Map([["name", 2]]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue("---\nname: my-skill\n---\n"),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const descDiagnostic = result.results[0].diagnostics.find(
                (d) => d.field === "description",
            );
            expect(descDiagnostic).toBeDefined();
            expect(descDiagnostic?.severity).toBe("error");
        });
    });

    describe("given a skill with name that does not match parent directory", () => {
        it("should return an error diagnostic for name mismatch", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
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
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: different-name\ndescription: A skill\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const nameDiagnostic = result.results[0].diagnostics.find(
                (d) => d.field === "name" && d.message.includes("match"),
            );
            expect(nameDiagnostic).toBeDefined();
            expect(nameDiagnostic?.severity).toBe("error");
            expect(nameDiagnostic?.line).toBe(2);
        });
    });

    describe("given a skill with invalid name format", () => {
        it("should return an error diagnostic for the invalid name", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
            const frontmatter: ParsedFrontmatter = {
                data: { name: "My Skill!", description: chance.sentence() },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: My Skill!\ndescription: A skill\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const nameDiagnostic = result.results[0].diagnostics.find(
                (d) => d.field === "name" && d.severity === "error",
            );
            expect(nameDiagnostic).toBeDefined();
        });
    });

    describe("given a skill missing recommended fields", () => {
        it("should return warning diagnostics for missing recommended fields", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
            const frontmatter = buildValidFrontmatter(skillName);
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: my-skill\ndescription: A skill\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            const warnings = result.results[0].diagnostics.filter(
                (d) => d.severity === "warning",
            );
            expect(warnings.length).toBeGreaterThan(0);
            const warningFields = warnings.map((w) => w.field);
            expect(warningFields).toContain("allowed-tools");
        });
    });

    describe("given a skill with no frontmatter", () => {
        it("should return an error diagnostic for missing frontmatter", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue("# No frontmatter here\n"),
                parseFrontmatter: vi.fn().mockReturnValue(null),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            expect(result.results[0].diagnostics).toHaveLength(1);
            expect(result.results[0].diagnostics[0].severity).toBe("error");
            expect(result.results[0].diagnostics[0].message).toContain(
                "frontmatter",
            );
        });
    });

    describe("given a skill with description exceeding max length", () => {
        it("should return an error diagnostic", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
            const longDescription = "a".repeat(1025);
            const frontmatter: ParsedFrontmatter = {
                data: { name: skillName, description: longDescription },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        `---\nname: ${skillName}\ndescription: ${longDescription}\n---\n`,
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            const descDiagnostic = result.results[0].diagnostics.find(
                (d) => d.field === "description" && d.severity === "error",
            );
            expect(descDiagnostic).toBeDefined();
        });
    });

    describe("given multiple skills", () => {
        it("should return results for all skills with correct totals", async () => {
            // Arrange
            const skill1Name = "skill-one";
            const skill2Name = "skill-two";
            const discovered: DiscoveredSkillFile[] = [
                {
                    filePath: `/repo/.github/skills/${skill1Name}/SKILL.md`,
                    skillName: skill1Name,
                },
                {
                    filePath: `/repo/.github/skills/${skill2Name}/SKILL.md`,
                    skillName: skill2Name,
                },
            ];
            const validFrontmatter1 = buildValidFrontmatter(skill1Name);
            const invalidFrontmatter2: ParsedFrontmatter = {
                data: { description: chance.sentence() },
                fieldLines: new Map([["description", 2]]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValueOnce(
                        "---\nname: skill-one\ndescription: A skill\n---\n",
                    )
                    .mockResolvedValueOnce("---\ndescription: A skill\n---\n"),
                parseFrontmatter: vi
                    .fn()
                    .mockReturnValueOnce(validFrontmatter1)
                    .mockReturnValueOnce(invalidFrontmatter2),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results).toHaveLength(2);
            expect(result.totalSkills).toBe(2);
            expect(result.totalErrors).toBeGreaterThan(0);
        });
    });

    describe("given an empty target directory", () => {
        it("should throw an error", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act & Assert
            await expect(useCase.execute({ targetDir: "" })).rejects.toThrow(
                "Target directory is required",
            );
        });
    });

    describe("given a skill with valid frontmatter including recommended fields", () => {
        it("should return no warnings for recommended fields", async () => {
            // Arrange
            const skillName = "my-skill";
            const filePath = `/repo/.github/skills/${skillName}/SKILL.md`;
            const discovered: DiscoveredSkillFile[] = [{ filePath, skillName }];
            const frontmatter: ParsedFrontmatter = {
                data: {
                    name: skillName,
                    description: chance.sentence(),
                    "allowed-tools": "tool1, tool2",
                },
                fieldLines: new Map([
                    ["name", 2],
                    ["description", 3],
                    ["allowed-tools", 4],
                ]),
                frontmatterStartLine: 1,
            };
            const gateway = createMockGateway({
                discoverSkills: vi.fn().mockResolvedValue(discovered),
                readSkillFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        "---\nname: my-skill\ndescription: A skill\nallowed-tools: tool1, tool2\n---\n",
                    ),
                parseFrontmatter: vi.fn().mockReturnValue(frontmatter),
            });
            const useCase = new LintSkillFrontmatterUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            const toolsWarning = result.results[0].diagnostics.find(
                (d) => d.field === "allowed-tools" && d.severity === "warning",
            );
            expect(toolsWarning).toBeUndefined();
        });
    });
});
