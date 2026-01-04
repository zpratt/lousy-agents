import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand, PROJECT_TYPE_OPTIONS } from "./init.js";

const chance = new Chance();

describe("Init command", () => {
    describe("when prompting for project type", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            mockPrompt = vi.fn().mockResolvedValue("CLI");
        });

        it("should display a prompt asking what type of project is being initialized", async () => {
            // Arrange
            const expectedMessage =
                "What type of project are you initializing?";

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt },
            });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                expectedMessage,
                expect.objectContaining({
                    type: "select",
                }),
            );
        });

        it("should present four project type options", async () => {
            // Arrange - done in beforeEach

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt },
            });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    options: PROJECT_TYPE_OPTIONS,
                }),
            );
        });

        it("should validate and use the selected project type when CLI is chosen", async () => {
            // Arrange
            const selectedType = "CLI";
            mockPrompt.mockResolvedValue(selectedType);
            const testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });

            try {
                // Act
                await initCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                });

                // Assert - verify scaffolding was created for CLI type
                const instructionsDir = join(
                    testDir,
                    ".github",
                    "instructions",
                );
                await expect(access(instructionsDir)).resolves.toBeUndefined();
            } finally {
                await rm(testDir, { recursive: true, force: true });
            }
        });

        it("should reject invalid project type selections", async () => {
            // Arrange
            const invalidType = chance.word();
            mockPrompt.mockResolvedValue(invalidType);

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: initCommand,
                    data: { prompt: mockPrompt },
                }),
            ).rejects.toThrow("Invalid project type");
        });
    });

    describe("when CLI project type is selected", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;

        beforeEach(async () => {
            mockPrompt = vi.fn().mockResolvedValue("CLI");
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should create .github/instructions directory when it does not exist", async () => {
            // Arrange
            const instructionsDir = join(testDir, ".github", "instructions");

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(instructionsDir)).resolves.toBeUndefined();
        });

        it("should create .github/copilot-instructions.md file when it does not exist", async () => {
            // Arrange
            const copilotInstructionsFile = join(
                testDir,
                ".github",
                "copilot-instructions.md",
            );

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(
                access(copilotInstructionsFile),
            ).resolves.toBeUndefined();
            const content = await readFile(copilotInstructionsFile, "utf-8");
            expect(content).toBe("");
        });

        it("should preserve existing .github/instructions directory", async () => {
            // Arrange
            const instructionsDir = join(testDir, ".github", "instructions");
            const existingFile = join(instructionsDir, "existing.md");
            const existingContent = chance.paragraph();
            await mkdir(instructionsDir, { recursive: true });
            await writeFile(existingFile, existingContent);

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const content = await readFile(existingFile, "utf-8");
            expect(content).toBe(existingContent);
        });

        it("should preserve existing .github/copilot-instructions.md file", async () => {
            // Arrange
            const githubDir = join(testDir, ".github");
            const copilotInstructionsFile = join(
                githubDir,
                "copilot-instructions.md",
            );
            const existingContent = `# ${chance.sentence()}\n\n${chance.paragraph()}`;
            await mkdir(githubDir, { recursive: true });
            await writeFile(copilotInstructionsFile, existingContent);

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const content = await readFile(copilotInstructionsFile, "utf-8");
            expect(content).toBe(existingContent);
        });
    });

    describe("when non-CLI project types are selected", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should not create CLI scaffolding when webapp is selected", async () => {
            // Arrange
            mockPrompt = vi.fn().mockResolvedValue("webapp");
            const instructionsDir = join(testDir, ".github", "instructions");

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(instructionsDir)).rejects.toThrow();
        });

        it("should not create CLI scaffolding when REST API is selected", async () => {
            // Arrange
            mockPrompt = vi.fn().mockResolvedValue("REST API");
            const copilotInstructionsFile = join(
                testDir,
                ".github",
                "copilot-instructions.md",
            );

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(copilotInstructionsFile)).rejects.toThrow();
        });

        it("should not create CLI scaffolding when GraphQL API is selected", async () => {
            // Arrange
            mockPrompt = vi.fn().mockResolvedValue("GraphQL API");
            const githubDir = join(testDir, ".github");

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(githubDir)).rejects.toThrow();
        });
    });
});
