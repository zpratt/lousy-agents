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

    describe("when webapp project type is selected", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;
        let projectName: string;

        beforeEach(async () => {
            projectName = chance.word();
            // First call returns project type, second call returns project name
            mockPrompt = vi
                .fn()
                .mockResolvedValueOnce("webapp")
                .mockResolvedValueOnce(projectName);
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should create package.json when it does not exist", async () => {
            // Arrange
            const packageJsonFile = join(testDir, "package.json");

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(packageJsonFile)).resolves.toBeUndefined();
            const content = await readFile(packageJsonFile, "utf-8");
            expect(content).toContain("next");
        });

        it("should create TypeScript configuration files when they do not exist", async () => {
            // Arrange - done in beforeEach

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const tsConfigFile = join(testDir, "tsconfig.json");
            await expect(access(tsConfigFile)).resolves.toBeUndefined();
            const content = await readFile(tsConfigFile, "utf-8");
            expect(content).toContain("next-env.d.ts");
        });

        it("should create Next.js configuration when it does not exist", async () => {
            // Arrange
            const nextConfigFile = join(testDir, "next.config.ts");

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(nextConfigFile)).resolves.toBeUndefined();
        });

        it("should create Vitest configuration files when they do not exist", async () => {
            // Arrange
            const vitestConfigFile = join(testDir, "vitest.config.ts");
            const vitestSetupFile = join(testDir, "vitest.setup.ts");

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(vitestConfigFile)).resolves.toBeUndefined();
            await expect(access(vitestSetupFile)).resolves.toBeUndefined();
        });

        it("should create .github/copilot-instructions.md with webapp content when it does not exist", async () => {
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
            expect(content).toContain("Next.js");
        });

        it("should create .github/instructions directory with instruction files", async () => {
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
            await expect(
                access(join(instructionsDir, "test.instructions.md")),
            ).resolves.toBeUndefined();
            await expect(
                access(join(instructionsDir, "spec.instructions.md")),
            ).resolves.toBeUndefined();
            await expect(
                access(join(instructionsDir, "pipeline.instructions.md")),
            ).resolves.toBeUndefined();
        });

        it("should preserve existing package.json file", async () => {
            // Arrange
            const packageJsonFile = join(testDir, "package.json");
            const existingContent = JSON.stringify(
                { name: chance.word(), version: "1.0.0" },
                null,
                2,
            );
            await writeFile(packageJsonFile, existingContent);

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const content = await readFile(packageJsonFile, "utf-8");
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

    describe("when using CLI arguments", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should use provided --kind argument without prompting when CLI is specified", async () => {
            // Arrange
            const mockPrompt = vi.fn();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "CLI"],
                args: { _: [], kind: "CLI" },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            expect(mockPrompt).not.toHaveBeenCalled();
            const instructionsDir = join(testDir, ".github", "instructions");
            await expect(access(instructionsDir)).resolves.toBeUndefined();
        });

        it("should use provided --kind argument without prompting when webapp is specified", async () => {
            // Arrange
            const mockPrompt = vi.fn();
            const projectName = chance.word();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "webapp", "--name", projectName],
                args: { _: [], kind: "webapp", name: projectName },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            expect(mockPrompt).not.toHaveBeenCalled();
            const packageJsonFile = join(testDir, "package.json");
            await expect(access(packageJsonFile)).resolves.toBeUndefined();
        });

        it("should display error for invalid --kind value", async () => {
            // Arrange
            const invalidKind = chance.word();
            const mockPrompt = vi.fn();

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: ["--kind", invalidKind],
                    args: { _: [], kind: invalidKind },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow("Invalid project type");
            expect(mockPrompt).not.toHaveBeenCalled();
        });

        it("should fall back to interactive prompt when --kind is not provided", async () => {
            // Arrange
            const mockPrompt = vi.fn().mockResolvedValue("CLI");

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                "What type of project are you initializing?",
                expect.objectContaining({
                    type: "select",
                }),
            );
        });

        it.each([
            ["CLI", ".github/instructions"],
            ["webapp", "package.json"],
        ])("should create identical project structure for %s type regardless of input method", async (projectType: string, verifyPath: string) => {
            // Arrange
            const cliTestDir = join(tmpdir(), `test-cli-${chance.guid()}`);
            const promptTestDir = join(
                tmpdir(),
                `test-prompt-${chance.guid()}`,
            );
            await mkdir(cliTestDir, { recursive: true });
            await mkdir(promptTestDir, { recursive: true });
            const projectName = chance.word();
            // For webapp: first call returns project type, second call returns project name
            const mockPrompt = vi
                .fn()
                .mockResolvedValueOnce(projectType)
                .mockResolvedValueOnce(projectName);

            try {
                // Act - using CLI arg
                await initCommand.run({
                    rawArgs: ["--kind", projectType, "--name", projectName],
                    args: { _: [], kind: projectType, name: projectName },
                    cmd: initCommand,
                    data: { prompt: vi.fn(), targetDir: cliTestDir },
                });

                // Act - using interactive prompt
                await initCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: initCommand,
                    data: {
                        prompt: mockPrompt,
                        targetDir: promptTestDir,
                    },
                });

                // Assert - both should create the same structure
                const cliPath = join(cliTestDir, verifyPath);
                const promptPath = join(promptTestDir, verifyPath);
                await expect(access(cliPath)).resolves.toBeUndefined();
                await expect(access(promptPath)).resolves.toBeUndefined();
            } finally {
                await rm(cliTestDir, { recursive: true, force: true });
                await rm(promptTestDir, { recursive: true, force: true });
            }
        });
    });

    describe("when project name is provided", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should use --name argument without prompting for project name", async () => {
            // Arrange
            const mockPrompt = vi.fn();
            const projectName = chance.word();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "webapp", "--name", projectName],
                args: { _: [], kind: "webapp", name: projectName },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            expect(mockPrompt).not.toHaveBeenCalled();
        });

        it("should prompt for project name when --kind webapp is provided without --name", async () => {
            // Arrange
            const projectName = chance.word();
            const mockPrompt = vi.fn().mockResolvedValue(projectName);

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "webapp"],
                args: { _: [], kind: "webapp" },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                "What is your project name?",
                expect.objectContaining({
                    type: "text",
                }),
            );
        });

        it("should apply project name to package.json template", async () => {
            // Arrange
            const projectName = chance.word();
            const mockPrompt = vi.fn();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "webapp", "--name", projectName],
                args: { _: [], kind: "webapp", name: projectName },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const packageJsonFile = join(testDir, "package.json");
            const content = await readFile(packageJsonFile, "utf-8");
            expect(content).toContain(`"name": "${projectName}"`);
        });

        it("should apply project name to devcontainer.json template", async () => {
            // Arrange
            const projectName = chance.word();
            const mockPrompt = vi.fn();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "webapp", "--name", projectName],
                args: { _: [], kind: "webapp", name: projectName },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const devcontainerFile = join(
                testDir,
                ".devcontainer",
                "devcontainer.json",
            );
            const content = await readFile(devcontainerFile, "utf-8");
            expect(content).toContain(`"name": "${projectName}"`);
        });

        it("should reject empty project name", async () => {
            // Arrange
            const mockPrompt = vi.fn().mockResolvedValue("");

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: ["--kind", "webapp"],
                    args: { _: [], kind: "webapp" },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow("Project name is required");
        });

        it("should reject whitespace-only project name", async () => {
            // Arrange
            const mockPrompt = vi.fn().mockResolvedValue("   ");

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: ["--kind", "webapp"],
                    args: { _: [], kind: "webapp" },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow("Project name is required");
        });
    });
});
