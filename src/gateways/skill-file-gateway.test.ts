import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemSkillFileGateway } from "./skill-file-gateway.js";

const chance = new Chance();

describe("SkillFileGateway", () => {
    let testDir: string;
    let gateway: FileSystemSkillFileGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-skill-gateway-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemSkillFileGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("skillDirectoryExists", () => {
        describe("given a skill directory that exists", () => {
            it("should return true", async () => {
                // Arrange
                const skillName = chance.word();
                const skillDir = join(testDir, ".github", "skills", skillName);
                await mkdir(skillDir, { recursive: true });

                // Act
                const result = await gateway.skillDirectoryExists(
                    testDir,
                    skillName,
                );

                // Assert
                expect(result).toBe(true);
            });
        });

        describe("given a skill directory that does not exist", () => {
            it("should return false", async () => {
                // Arrange
                const skillName = chance.word();

                // Act
                const result = await gateway.skillDirectoryExists(
                    testDir,
                    skillName,
                );

                // Assert
                expect(result).toBe(false);
            });
        });

        describe("given the skills directory does not exist", () => {
            it("should return false", async () => {
                // Arrange
                const skillName = chance.word();
                const emptyDir = join(testDir, "empty");
                await mkdir(emptyDir, { recursive: true });

                // Act
                const result = await gateway.skillDirectoryExists(
                    emptyDir,
                    skillName,
                );

                // Assert
                expect(result).toBe(false);
            });
        });
    });

    describe("ensureSkillDirectory", () => {
        describe("given the skill directory does not exist", () => {
            it("should create the .github/skills/<name> directory", async () => {
                // Arrange
                const skillName = chance.word();
                const skillDir = join(testDir, ".github", "skills", skillName);

                // Act
                await gateway.ensureSkillDirectory(testDir, skillName);

                // Assert
                const stat = await import("node:fs/promises").then((fs) =>
                    fs.stat(skillDir),
                );
                expect(stat.isDirectory()).toBe(true);
            });
        });

        describe("given the .github directory exists but skills does not", () => {
            it("should create the skills and skill directories", async () => {
                // Arrange
                const skillName = chance.word();
                const githubDir = join(testDir, ".github");
                await mkdir(githubDir, { recursive: true });

                // Act
                await gateway.ensureSkillDirectory(testDir, skillName);

                // Assert
                const skillDir = join(testDir, ".github", "skills", skillName);
                const stat = await import("node:fs/promises").then((fs) =>
                    fs.stat(skillDir),
                );
                expect(stat.isDirectory()).toBe(true);
            });
        });

        describe("given the skill directory already exists", () => {
            it("should not throw an error", async () => {
                // Arrange
                const skillName = chance.word();
                const skillDir = join(testDir, ".github", "skills", skillName);
                await mkdir(skillDir, { recursive: true });

                // Act & Assert
                await expect(
                    gateway.ensureSkillDirectory(testDir, skillName),
                ).resolves.not.toThrow();
            });
        });
    });

    describe("writeSkillFile", () => {
        describe("given valid content and path", () => {
            it("should write the content to SKILL.md", async () => {
                // Arrange
                const skillName = chance.word();
                const content = chance.paragraph();
                const skillDir = join(testDir, ".github", "skills", skillName);
                await mkdir(skillDir, { recursive: true });

                // Act
                await gateway.writeSkillFile(testDir, skillName, content);

                // Assert
                const filePath = join(skillDir, "SKILL.md");
                const fileContent = await readFile(filePath, "utf-8");
                expect(fileContent).toBe(content);
            });
        });
    });

    describe("getSkillDirectoryPath", () => {
        it("should return the correct path for a skill directory", () => {
            // Arrange
            const skillName = "github-actions-debug";

            // Act
            const result = gateway.getSkillDirectoryPath(testDir, skillName);

            // Assert
            expect(result).toBe(
                join(testDir, ".github", "skills", "github-actions-debug"),
            );
        });
    });

    describe("getSkillFilePath", () => {
        it("should return the correct path for a SKILL.md file", () => {
            // Arrange
            const skillName = "github-actions-debug";

            // Act
            const result = gateway.getSkillFilePath(testDir, skillName);

            // Assert
            expect(result).toBe(
                join(
                    testDir,
                    ".github",
                    "skills",
                    "github-actions-debug",
                    "SKILL.md",
                ),
            );
        });
    });
});
