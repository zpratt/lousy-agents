import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "./init.js";

describe("Init command", () => {
    describe("when prompting for project type", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            mockPrompt = vi.fn().mockResolvedValue("CLI");
        });

        it("should display a prompt asking what type of project is being initialized", async () => {
            // Arrange - done in beforeEach

            // Act
            await initCommand.run({ prompt: mockPrompt });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                "What type of project are you initializing?",
                expect.objectContaining({
                    type: "select",
                }),
            );
        });

        it("should present four project type options", async () => {
            // Arrange - done in beforeEach

            // Act
            await initCommand.run({ prompt: mockPrompt });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    options: ["CLI", "webapp", "REST API", "GraphQL API"],
                }),
            );
        });

        it("should capture the user selection", async () => {
            // Arrange
            const expectedSelection = "CLI";
            mockPrompt.mockResolvedValue(expectedSelection);

            // Act
            await initCommand.run({ prompt: mockPrompt });

            // Assert
            expect(mockPrompt).toHaveBeenCalled();
        });
    });

    describe("when CLI project type is selected", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;

        beforeEach(async () => {
            mockPrompt = vi.fn().mockResolvedValue("CLI");
            testDir = join(tmpdir(), `lousy-agents-test-${Date.now()}`);
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
                prompt: mockPrompt,
                targetDir: testDir,
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
                prompt: mockPrompt,
                targetDir: testDir,
            });

            // Assert
            await expect(
                access(copilotInstructionsFile),
            ).resolves.toBeUndefined();
            const content = await readFile(copilotInstructionsFile, "utf-8");
            expect(content.length).toBeGreaterThan(0);
        });

        it("should preserve existing .github/instructions directory", async () => {
            // Arrange
            const instructionsDir = join(testDir, ".github", "instructions");
            const existingFile = join(instructionsDir, "existing.md");
            await mkdir(instructionsDir, { recursive: true });
            await writeFile(existingFile, "existing content");

            // Act
            await initCommand.run({
                prompt: mockPrompt,
                targetDir: testDir,
            });

            // Assert
            const content = await readFile(existingFile, "utf-8");
            expect(content).toBe("existing content");
        });

        it("should preserve existing .github/copilot-instructions.md file", async () => {
            // Arrange
            const githubDir = join(testDir, ".github");
            const copilotInstructionsFile = join(
                githubDir,
                "copilot-instructions.md",
            );
            const existingContent =
                "# Existing Instructions\n\nDo not modify this.";
            await mkdir(githubDir, { recursive: true });
            await writeFile(copilotInstructionsFile, existingContent);

            // Act
            await initCommand.run({
                prompt: mockPrompt,
                targetDir: testDir,
            });

            // Assert
            const content = await readFile(copilotInstructionsFile, "utf-8");
            expect(content).toBe(existingContent);
        });
    });
});
