import { describe, expect, it } from "vitest";
import { getProjectStructure, loadInitConfig } from "./config.js";

describe("Config", () => {
    describe("loadInitConfig", () => {
        it("should load default configuration", async () => {
            // Act
            const config = await loadInitConfig();

            // Assert
            expect(config).toBeDefined();
            expect(config.structures).toBeDefined();
        });
    });

    describe("getProjectStructure", () => {
        it("should return CLI structure for CLI project type", async () => {
            // Act
            const structure = await getProjectStructure("cli");

            // Assert
            expect(structure).toBeDefined();
            expect(structure?.nodes).toBeDefined();
            expect(structure?.nodes.length).toBeGreaterThan(0);
        });

        it("should include package.json in CLI structure", async () => {
            // Act
            const structure = await getProjectStructure("cli");

            // Assert
            expect(structure).toBeDefined();
            const fileNodes = structure?.nodes.filter(
                (node) => node.type === "file" && node.path === "package.json",
            );
            expect(fileNodes?.length).toBe(1);
            expect(fileNodes?.[0].content).toContain("citty");
        });

        it("should include configuration files in CLI structure", async () => {
            // Act
            const structure = await getProjectStructure("cli");

            // Assert
            expect(structure).toBeDefined();
            const configFiles = [
                "tsconfig.json",
                "vitest.config.ts",
                "vitest.setup.ts",
                "biome.json",
                ".editorconfig",
                ".nvmrc",
            ];

            for (const fileName of configFiles) {
                const fileNode = structure?.nodes.find(
                    (node) => node.type === "file" && node.path === fileName,
                );
                expect(fileNode).toBeDefined();
            }
        });

        it("should include GitHub instructions in CLI structure", async () => {
            // Act
            const structure = await getProjectStructure("cli");

            // Assert
            expect(structure).toBeDefined();
            const githubFiles = [
                ".github/copilot-instructions.md",
                ".github/instructions/test.instructions.md",
                ".github/instructions/spec.instructions.md",
                ".github/instructions/pipeline.instructions.md",
                ".github/instructions/software-architecture.instructions.md",
            ];

            for (const fileName of githubFiles) {
                const fileNode = structure?.nodes.find(
                    (node) => node.type === "file" && node.path === fileName,
                );
                expect(fileNode).toBeDefined();
            }
        });

        it("should include package.json in webapp structure", async () => {
            // Act
            const structure = await getProjectStructure("webapp");

            // Assert
            expect(structure).toBeDefined();
            const fileNodes = structure?.nodes.filter(
                (node) => node.type === "file" && node.path === "package.json",
            );
            expect(fileNodes?.length).toBe(1);
            expect(fileNodes?.[0].content).toContain("next");
        });

        it("should include configuration files in webapp structure", async () => {
            // Act
            const structure = await getProjectStructure("webapp");

            // Assert
            expect(structure).toBeDefined();
            const configFiles = [
                "tsconfig.json",
                "next.config.ts",
                "vitest.config.ts",
                "vitest.setup.ts",
                "biome.json",
                ".editorconfig",
                ".nvmrc",
            ];

            for (const fileName of configFiles) {
                const fileNode = structure?.nodes.find(
                    (node) => node.type === "file" && node.path === fileName,
                );
                expect(fileNode).toBeDefined();
            }
        });

        it("should include GitHub instructions in webapp structure", async () => {
            // Act
            const structure = await getProjectStructure("webapp");

            // Assert
            expect(structure).toBeDefined();
            const githubFiles = [
                ".github/copilot-instructions.md",
                ".github/instructions/test.instructions.md",
                ".github/instructions/spec.instructions.md",
                ".github/instructions/pipeline.instructions.md",
            ];

            for (const fileName of githubFiles) {
                const fileNode = structure?.nodes.find(
                    (node) => node.type === "file" && node.path === fileName,
                );
                expect(fileNode).toBeDefined();
            }
        });

        it("should include directory nodes for .github and .github/instructions in webapp structure", async () => {
            // Act
            const structure = await getProjectStructure("webapp");

            // Assert
            expect(structure).toBeDefined();
            const directoryNodes = structure?.nodes.filter(
                (node) => node.type === "directory",
            );
            const githubDir = directoryNodes?.find(
                (node) => node.path === ".github",
            );
            const instructionsDir = directoryNodes?.find(
                (node) => node.path === ".github/instructions",
            );
            expect(githubDir).toBeDefined();
            expect(instructionsDir).toBeDefined();
        });

        it("should return webapp structure for webapp project type", async () => {
            // Act
            const structure = await getProjectStructure("webapp");

            // Assert
            expect(structure).toBeDefined();
            expect(structure?.nodes).toBeDefined();
            expect(structure?.nodes.length).toBeGreaterThan(0);
        });

        it("should return REST API structure for REST API project type", async () => {
            // Act
            const structure = await getProjectStructure("api");

            // Assert
            expect(structure).toBeDefined();
            expect(structure?.nodes).toBeDefined();
            expect(structure?.nodes.length).toBeGreaterThan(0);
        });

        it("should throw error for GraphQL API project type (not yet supported)", async () => {
            // Act & Assert
            await expect(getProjectStructure("graphql")).rejects.toThrow(
                'Project type "graphql" is not yet supported',
            );
        });

        it.each([
            "cli",
            "webapp",
            "api",
        ] as const)("should include feature-to-plan skill files with content in %s structure", async (projectType) => {
            // Act
            const structure = await getProjectStructure(projectType);

            // Assert — verify file nodes exist and have non-empty, correct content
            const skillFileExpectations: Array<[string, string]> = [
                [".agents/skills/feature-to-plan/SKILL.md", "feature-to-plan"],
                [
                    ".agents/skills/feature-to-plan/references/interactive-flow.md",
                    "feature-to-plan",
                ],
                [
                    ".agents/skills/feature-to-plan/references/spec-format.md",
                    "feature-to-plan",
                ],
            ];

            for (const [filePath, expectedContent] of skillFileExpectations) {
                const fileNode = structure?.nodes.find(
                    (node) => node.type === "file" && node.path === filePath,
                );
                expect(
                    fileNode,
                    `Expected file node for ${filePath} in ${projectType} structure`,
                ).toBeDefined();
                expect(
                    fileNode?.content,
                    `Expected ${filePath} to contain "${expectedContent}"`,
                ).toContain(expectedContent);
            }
        });

        it.each([
            "cli",
            "webapp",
            "api",
        ] as const)("should include feature-to-plan skill directory nodes in %s structure", async (projectType) => {
            // Act
            const structure = await getProjectStructure(projectType);

            // Assert — directory nodes must be present so the scaffold writer
            // can create files under them without failing at runtime
            const skillDirs = [
                ".agents",
                ".agents/skills",
                ".agents/skills/feature-to-plan",
                ".agents/skills/feature-to-plan/references",
            ];

            for (const dirPath of skillDirs) {
                const dirNode = structure?.nodes.find(
                    (node) =>
                        node.type === "directory" && node.path === dirPath,
                );
                expect(
                    dirNode,
                    `Expected directory node for ${dirPath} in ${projectType} structure`,
                ).toBeDefined();
            }
        });
    });
});
