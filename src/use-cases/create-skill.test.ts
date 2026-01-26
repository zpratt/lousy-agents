import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { SkillFileGateway } from "../gateways/skill-file-gateway.js";
import { CreateSkillUseCase } from "./create-skill.js";

const chance = new Chance();

function createMockGateway(): SkillFileGateway {
    return {
        skillDirectoryExists: vi.fn().mockResolvedValue(false),
        ensureSkillDirectory: vi.fn().mockResolvedValue(undefined),
        writeSkillFile: vi.fn().mockResolvedValue(undefined),
        getSkillDirectoryPath: vi.fn().mockReturnValue("/mock/path/skill"),
        getSkillFilePath: vi.fn().mockReturnValue("/mock/path/skill/SKILL.md"),
    };
}

describe("CreateSkillUseCase", () => {
    describe("given a valid skill name", () => {
        it("should normalize the skill name", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = "GitHub Actions Debug";

            // Act
            const result = await useCase.execute(targetDir, skillName);

            // Assert
            expect(result.success).toBe(true);
            expect(result.normalizedName).toBe("github-actions-debug");
        });

        it("should ensure the skill directory exists", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = chance.word();

            // Act
            await useCase.execute(targetDir, skillName);

            // Assert
            expect(gateway.ensureSkillDirectory).toHaveBeenCalledWith(
                targetDir,
                skillName.toLowerCase(),
            );
        });

        it("should write the SKILL.md file", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = "debugging";

            // Act
            await useCase.execute(targetDir, skillName);

            // Assert
            expect(gateway.writeSkillFile).toHaveBeenCalledWith(
                targetDir,
                "debugging",
                expect.stringContaining("name: debugging"),
            );
        });

        it("should return the skill paths on success", async () => {
            // Arrange
            const gateway = createMockGateway();
            const expectedDirPath = "/mock/path/test-skill";
            const expectedFilePath = "/mock/path/test-skill/SKILL.md";
            gateway.getSkillDirectoryPath = vi
                .fn()
                .mockReturnValue(expectedDirPath);
            gateway.getSkillFilePath = vi
                .fn()
                .mockReturnValue(expectedFilePath);
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = chance.word();

            // Act
            const result = await useCase.execute(targetDir, skillName);

            // Assert
            expect(result.skillDirectoryPath).toBe(expectedDirPath);
            expect(result.skillFilePath).toBe(expectedFilePath);
        });
    });

    describe("given a skill directory that already exists", () => {
        it("should return an error result", async () => {
            // Arrange
            const gateway = createMockGateway();
            gateway.skillDirectoryExists = vi.fn().mockResolvedValue(true);
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = "debugging";

            // Act
            const result = await useCase.execute(targetDir, skillName);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain("already exists");
        });

        it("should not write the skill file", async () => {
            // Arrange
            const gateway = createMockGateway();
            gateway.skillDirectoryExists = vi.fn().mockResolvedValue(true);
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = "debugging";

            // Act
            await useCase.execute(targetDir, skillName);

            // Assert
            expect(gateway.writeSkillFile).not.toHaveBeenCalled();
        });

        it("should include the directory path in the error", async () => {
            // Arrange
            const gateway = createMockGateway();
            gateway.skillDirectoryExists = vi.fn().mockResolvedValue(true);
            const expectedPath = "/project/.github/skills/debugging";
            gateway.getSkillDirectoryPath = vi
                .fn()
                .mockReturnValue(expectedPath);
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/project";
            const skillName = "debugging";

            // Act
            const result = await useCase.execute(targetDir, skillName);

            // Assert
            expect(result.error).toContain(expectedPath);
        });
    });

    describe("given an empty skill name", () => {
        it("should return an error result", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = "";

            // Act
            const result = await useCase.execute(targetDir, skillName);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain("Skill name is required");
        });
    });

    describe("given a skill name with only spaces", () => {
        it("should return an error result", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = "   ";

            // Act
            const result = await useCase.execute(targetDir, skillName);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain("Skill name is required");
        });
    });

    describe("given a skill name that is too long", () => {
        it("should return an error result", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = "a".repeat(101);

            // Act
            const result = await useCase.execute(targetDir, skillName);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain("100 characters or less");
        });
    });

    describe("given a skill name with invalid characters", () => {
        it("should return an error result for special characters", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateSkillUseCase(gateway);
            const targetDir = "/test/dir";
            const skillName = "test@skill!";

            // Act
            const result = await useCase.execute(targetDir, skillName);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain("can only contain");
        });
    });
});
