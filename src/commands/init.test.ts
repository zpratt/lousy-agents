import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand, SUPPORTED_PROJECT_TYPES } from "./init.js";

const chance = new Chance();

type SupportedProjectType = "webapp" | "api" | "cli";

async function setupTestDir(): Promise<string> {
    const testDir = join(tmpdir(), `test-${chance.guid()}`);
    await mkdir(testDir, { recursive: true });
    return testDir;
}

async function teardownTestDir(testDir: string): Promise<void> {
    await rm(testDir, { recursive: true, force: true });
}

function createMockPrompt(
    projectType: SupportedProjectType,
    projectName: string,
): ReturnType<typeof vi.fn> {
    return vi
        .fn()
        .mockResolvedValueOnce(projectType)
        .mockResolvedValueOnce(projectName);
}

describe("Init command", () => {
    describe("when prompting for project type", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
            const projectName = chance.word().toLowerCase();
            mockPrompt = vi
                .fn()
                .mockResolvedValueOnce("webapp")
                .mockResolvedValueOnce(projectName);
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
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
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                expectedMessage,
                expect.objectContaining({
                    type: "select",
                }),
            );
        });

        it("should present only supported project type options", async () => {
            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    options: SUPPORTED_PROJECT_TYPES,
                }),
            );
        });

        it("should validate and use the selected project type when webapp is chosen", async () => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = vi
                .fn()
                .mockResolvedValueOnce("webapp")
                .mockResolvedValueOnce(projectName);

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const packageJson = join(testDir, "package.json");
            await expect(access(packageJson)).resolves.toBeUndefined();
        });

        it("should reject invalid project type selections", async () => {
            // Arrange
            const invalidType = chance.word();
            mockPrompt = vi.fn().mockResolvedValue(invalidType);

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow("Invalid project type");
        });
    });

    describe("when CLI project type is selected", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;
        let projectName: string;

        beforeEach(async () => {
            projectName = chance.word().toLowerCase();
            mockPrompt = vi
                .fn()
                .mockResolvedValueOnce("cli")
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
            expect(content).toContain("citty");
        });

        it("should create .github/copilot-instructions.md with CLI content when it does not exist", async () => {
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
            expect(content).toContain("citty");
        });

        it("should create TypeScript configuration files when they do not exist", async () => {
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
        });

        it("should prompt for project name when --kind cli is provided without --name", async () => {
            // Arrange
            const cliProjectName = chance.word().toLowerCase();
            const cliMockPrompt = vi.fn().mockResolvedValue(cliProjectName);

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "cli"],
                args: { _: [], kind: "cli" },
                cmd: initCommand,
                data: { prompt: cliMockPrompt, targetDir: testDir },
            });

            // Assert
            expect(cliMockPrompt).toHaveBeenCalledWith(
                "What is your project name?",
                expect.objectContaining({
                    type: "text",
                    placeholder: "my-cli",
                }),
            );
        });

        it("should apply project name to package.json template", async () => {
            // Arrange
            const cliProjectName = chance.word().toLowerCase();
            const cliMockPrompt = vi.fn();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "cli", "--name", cliProjectName],
                args: { _: [], kind: "cli", name: cliProjectName },
                cmd: initCommand,
                data: { prompt: cliMockPrompt, targetDir: testDir },
            });

            // Assert
            const packageJsonFile = join(testDir, "package.json");
            const content = await readFile(packageJsonFile, "utf-8");
            expect(content).toContain(`"name": "${cliProjectName}"`);
        });

        it("should apply project name to devcontainer.json template", async () => {
            // Arrange
            const cliProjectName = chance.word().toLowerCase();
            const cliMockPrompt = vi.fn();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "cli", "--name", cliProjectName],
                args: { _: [], kind: "cli", name: cliProjectName },
                cmd: initCommand,
                data: { prompt: cliMockPrompt, targetDir: testDir },
            });

            // Assert
            const devcontainerFile = join(
                testDir,
                ".devcontainer",
                "devcontainer.json",
            );
            const content = await readFile(devcontainerFile, "utf-8");
            expect(content).toContain(`"name": "${cliProjectName}"`);
        });
    });

    describe("when webapp project type is selected", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;
        let projectName: string;

        beforeEach(async () => {
            projectName = chance.word().toLowerCase();
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

        it("should create REST API scaffolding when REST API is selected", async () => {
            // Arrange
            const projectName = "my-test-api";
            mockPrompt = vi
                .fn()
                .mockResolvedValueOnce("api")
                .mockResolvedValueOnce(projectName);
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
        });

        it("should create CLI scaffolding when CLI is selected", async () => {
            // Arrange
            const projectName = "my-test-cli";
            mockPrompt = vi
                .fn()
                .mockResolvedValueOnce("cli")
                .mockResolvedValueOnce(projectName);
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
        });

        it("should throw error when GraphQL API is selected (not yet supported)", async () => {
            // Arrange
            mockPrompt = vi.fn().mockResolvedValue("graphql");

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow(
                'Project type "graphql" is not yet supported. Supported types: webapp, api, cli',
            );
        });

        it("should throw error when invalid project type is selected", async () => {
            // Arrange
            mockPrompt = vi.fn().mockResolvedValue("unknown-project-type");

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow(
                "Invalid project type. Expected one of: cli, webapp, api, graphql",
            );
        });
    });

    describe("when REST API project type is selected", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;
        let projectName: string;

        beforeEach(async () => {
            projectName = chance.word().toLowerCase();
            mockPrompt = vi
                .fn()
                .mockResolvedValueOnce("api")
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
            expect(content).toContain("fastify");
        });

        it("should create TypeScript configuration files when they do not exist", async () => {
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
        });

        it("should create .github/copilot-instructions.md with REST API content when it does not exist", async () => {
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
            expect(content).toContain("Fastify");
        });

        it("should prompt for project name when --kind api is provided without --name", async () => {
            // Arrange
            const apiProjectName = chance.word().toLowerCase();
            const apiMockPrompt = vi.fn().mockResolvedValue(apiProjectName);

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "api"],
                args: { _: [], kind: "api" },
                cmd: initCommand,
                data: { prompt: apiMockPrompt, targetDir: testDir },
            });

            // Assert
            expect(apiMockPrompt).toHaveBeenCalledWith(
                "What is your project name?",
                expect.objectContaining({
                    type: "text",
                    placeholder: "my-rest-api",
                }),
            );
        });

        it("should apply project name to package.json template", async () => {
            // Arrange
            const apiProjectName = chance.word().toLowerCase();
            const apiMockPrompt = vi.fn();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "api", "--name", apiProjectName],
                args: { _: [], kind: "api", name: apiProjectName },
                cmd: initCommand,
                data: { prompt: apiMockPrompt, targetDir: testDir },
            });

            // Assert
            const packageJsonFile = join(testDir, "package.json");
            const content = await readFile(packageJsonFile, "utf-8");
            expect(content).toContain(`"name": "${apiProjectName}"`);
        });

        it("should apply project name to devcontainer.json template", async () => {
            // Arrange
            const apiProjectName = chance.word().toLowerCase();
            const apiMockPrompt = vi.fn();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "api", "--name", apiProjectName],
                args: { _: [], kind: "api", name: apiProjectName },
                cmd: initCommand,
                data: { prompt: apiMockPrompt, targetDir: testDir },
            });

            // Assert
            const devcontainerFile = join(
                testDir,
                ".devcontainer",
                "devcontainer.json",
            );
            const content = await readFile(devcontainerFile, "utf-8");
            expect(content).toContain(`"name": "${apiProjectName}"`);
        });
    });

    describe("when scaffolding shared behavior across project types", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;

        beforeEach(async () => {
            testDir = await setupTestDir();
        });

        afterEach(async () => {
            await teardownTestDir(testDir);
        });

        it.each([
            ["webapp", "package.json"],
            ["api", "package.json"],
            ["cli", "package.json"],
        ])("should create expected scaffolding for %s project type", async (projectType: string, expectedFile: string) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(
                projectType as SupportedProjectType,
                projectName,
            );

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const fullPath = join(testDir, expectedFile);
            await expect(access(fullPath)).resolves.toBeUndefined();
        });

        it.each([
            "webapp",
            "api",
            "cli",
        ] as const)("should create Vitest configuration files when %s project type is selected", async (projectType) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(projectType, projectName);
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

        it.each([
            "webapp",
            "api",
            "cli",
        ] as const)("should create .github/instructions directory with instruction files for %s project type", async (projectType) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(projectType, projectName);
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
            await expect(
                access(
                    join(
                        instructionsDir,
                        "software-architecture.instructions.md",
                    ),
                ),
            ).resolves.toBeUndefined();
        });

        it.each([
            "webapp",
            "api",
            "cli",
        ] as const)("should create .github/ISSUE_TEMPLATE/feature-to-spec.yml for %s project type", async (projectType) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(projectType, projectName);
            const featureToSpecFile = join(
                testDir,
                ".github",
                "ISSUE_TEMPLATE",
                "feature-to-spec.yml",
            );

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(featureToSpecFile)).resolves.toBeUndefined();
            const content = await readFile(featureToSpecFile, "utf-8");
            expect(content).toContain("Copilot Feature To Spec");
            expect(content).toContain("copilot-ready");
        });

        it.each([
            "webapp",
            "api",
            "cli",
        ] as const)("should create .github/workflows/assign-copilot.yml for %s project type", async (projectType) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(projectType, projectName);
            const assignCopilotFile = join(
                testDir,
                ".github",
                "workflows",
                "assign-copilot.yml",
            );

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(assignCopilotFile)).resolves.toBeUndefined();
            const content = await readFile(assignCopilotFile, "utf-8");
            expect(content).toContain("Auto-Assign Copilot");
            expect(content).toContain("@copilot");
        });

        it.each([
            "webapp",
            "api",
            "cli",
        ] as const)("should create .github/specs/README.md for %s project type", async (projectType) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(projectType, projectName);
            const specsReadmeFile = join(
                testDir,
                ".github",
                "specs",
                "README.md",
            );

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            await expect(access(specsReadmeFile)).resolves.toBeUndefined();
            const content = await readFile(specsReadmeFile, "utf-8");
            expect(content).toContain("Specifications Directory");
            expect(content).toContain("EARS");
        });
    });

    describe("when preserving existing files across project types", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;
        let testDir: string;

        beforeEach(async () => {
            testDir = await setupTestDir();
        });

        afterEach(async () => {
            await teardownTestDir(testDir);
        });

        it.each([
            "webapp",
            "api",
            "cli",
        ] as const)("should preserve existing feature-to-spec.yml file for %s project type", async (projectType) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(projectType, projectName);
            const issueTemplateDir = join(testDir, ".github", "ISSUE_TEMPLATE");
            const featureToSpecFile = join(
                issueTemplateDir,
                "feature-to-spec.yml",
            );
            const existingContent = `---\nname: Custom Template\n`;
            await mkdir(issueTemplateDir, { recursive: true });
            await writeFile(featureToSpecFile, existingContent);

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const content = await readFile(featureToSpecFile, "utf-8");
            expect(content).toBe(existingContent);
        });

        it.each([
            "webapp",
            "api",
            "cli",
        ] as const)("should preserve existing assign-copilot.yml file for %s project type", async (projectType) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(projectType, projectName);
            const workflowsDir = join(testDir, ".github", "workflows");
            const assignCopilotFile = join(workflowsDir, "assign-copilot.yml");
            const existingContent = `---\nname: Custom Workflow\n`;
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(assignCopilotFile, existingContent);

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const content = await readFile(assignCopilotFile, "utf-8");
            expect(content).toBe(existingContent);
        });

        it.each([
            "webapp",
            "api",
            "cli",
        ] as const)("should preserve existing specs directory content for %s project type", async (projectType) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(projectType, projectName);
            const specsDir = join(testDir, ".github", "specs");
            const existingSpecFile = join(specsDir, "existing-spec.md");
            const existingContent = `# Existing Spec\n\nSome content`;
            await mkdir(specsDir, { recursive: true });
            await writeFile(existingSpecFile, existingContent);

            // Act
            await initCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            const content = await readFile(existingSpecFile, "utf-8");
            expect(content).toBe(existingContent);
        });

        it.each([
            "webapp",
            "api",
            "cli",
        ] as const)("should preserve existing package.json file for %s project type", async (projectType) => {
            // Arrange
            const projectName = chance.word().toLowerCase();
            mockPrompt = createMockPrompt(projectType, projectName);
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

    describe("when using CLI arguments", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should use provided --kind cli argument to create CLI scaffolding", async () => {
            // Arrange
            const mockPrompt = vi.fn();
            const projectName = chance.word().toLowerCase();

            // Act
            await initCommand.run({
                rawArgs: ["--kind", "cli", "--name", projectName],
                args: { _: [], kind: "cli", name: projectName },
                cmd: initCommand,
                data: { prompt: mockPrompt, targetDir: testDir },
            });

            // Assert
            expect(mockPrompt).not.toHaveBeenCalled();
            const packageJsonFile = join(testDir, "package.json");
            await expect(access(packageJsonFile)).resolves.toBeUndefined();
        });

        it("should throw error when --kind graphql is specified (not yet supported)", async () => {
            // Arrange
            const mockPrompt = vi.fn();

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: ["--kind", "graphql"],
                    args: { _: [], kind: "graphql" },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow(
                'Project type "graphql" is not yet supported. Supported types: webapp, api, cli',
            );
            expect(mockPrompt).not.toHaveBeenCalled();
        });

        it("should use provided --kind argument without prompting when webapp is specified", async () => {
            // Arrange
            const mockPrompt = vi.fn();
            const projectName = chance.word().toLowerCase();

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
            const projectName = chance.word().toLowerCase();
            const mockPrompt = vi
                .fn()
                .mockResolvedValueOnce("webapp")
                .mockResolvedValueOnce(projectName);

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
            ["webapp", "package.json"],
            ["api", "package.json"],
            ["cli", "package.json"],
        ])("should create identical project structure for %s type regardless of input method", async (projectType: string, verifyPath: string) => {
            // Arrange
            const cliTestDir = join(tmpdir(), `test-cli-${chance.guid()}`);
            const promptTestDir = join(
                tmpdir(),
                `test-prompt-${chance.guid()}`,
            );
            await mkdir(cliTestDir, { recursive: true });
            await mkdir(promptTestDir, { recursive: true });
            const projectName = chance.word().toLowerCase();
            const mockPrompt = vi
                .fn()
                .mockResolvedValueOnce(projectType)
                .mockResolvedValueOnce(projectName);

            try {
                // Act
                await initCommand.run({
                    rawArgs: ["--kind", projectType, "--name", projectName],
                    args: { _: [], kind: projectType, name: projectName },
                    cmd: initCommand,
                    data: { prompt: vi.fn(), targetDir: cliTestDir },
                });

                await initCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: initCommand,
                    data: {
                        prompt: mockPrompt,
                        targetDir: promptTestDir,
                    },
                });

                // Assert
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
            const projectName = chance.word().toLowerCase();

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
            const projectName = chance.word().toLowerCase();
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
            const projectName = chance.word().toLowerCase();
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
            const projectName = chance.word().toLowerCase();
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

        it("should reject project names with uppercase letters", async () => {
            // Arrange
            const mockPrompt = vi.fn().mockResolvedValue("MyProject");

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: ["--kind", "webapp"],
                    args: { _: [], kind: "webapp" },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow("Invalid project name");
        });

        it("should reject project names with spaces", async () => {
            // Arrange
            const mockPrompt = vi.fn().mockResolvedValue("my project");

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: ["--kind", "webapp"],
                    args: { _: [], kind: "webapp" },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow("Invalid project name");
        });

        it("should accept valid npm package names with hyphens", async () => {
            // Arrange
            const projectName = "my-valid-project";
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

        it("should accept valid npm package names with underscores", async () => {
            // Arrange
            const projectName = "my_valid_project";
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

        it("should accept valid npm package names with periods", async () => {
            // Arrange
            const projectName = "my.valid.project";
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

        it("should accept valid npm package names starting with numbers", async () => {
            // Arrange
            const projectName = "123project";
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

        it("should reject project names exceeding 214 characters", async () => {
            // Arrange
            const projectName = "a".repeat(215);
            const mockPrompt = vi.fn();

            // Act & Assert
            await expect(
                initCommand.run({
                    rawArgs: ["--kind", "webapp", "--name", projectName],
                    args: { _: [], kind: "webapp", name: projectName },
                    cmd: initCommand,
                    data: { prompt: mockPrompt, targetDir: testDir },
                }),
            ).rejects.toThrow("Invalid project name");
        });

        it("should accept valid scoped npm package names", async () => {
            // Arrange
            const projectName = "@myorg/my-package";
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
    });
});
