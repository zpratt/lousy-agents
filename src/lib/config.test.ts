import { describe, expect, it } from "vitest";
import { getProjectStructure, loadInitConfig } from "./config.js";

describe("Config", () => {
    describe("loadInitConfig", () => {
        it("should load default configuration with CLI structure", async () => {
            // Act
            const config = await loadInitConfig();

            // Assert
            expect(config).toBeDefined();
            expect(config.structures).toBeDefined();
            expect(config.structures?.CLI).toBeDefined();
        });

        it("should include .github/instructions directory in CLI structure", async () => {
            // Act
            const config = await loadInitConfig();

            // Assert
            const cliStructure = config.structures?.CLI;
            expect(cliStructure).toBeDefined();
            const directoryNodes = cliStructure?.nodes.filter(
                (node) => node.type === "directory",
            );
            expect(directoryNodes).toContainEqual({
                type: "directory",
                path: ".github/instructions",
            });
        });

        it("should include .github/copilot-instructions.md file in CLI structure", async () => {
            // Act
            const config = await loadInitConfig();

            // Assert
            const cliStructure = config.structures?.CLI;
            expect(cliStructure).toBeDefined();
            const fileNodes = cliStructure?.nodes.filter(
                (node) => node.type === "file",
            );
            expect(fileNodes).toContainEqual({
                type: "file",
                path: ".github/copilot-instructions.md",
                content: "",
            });
        });
    });

    describe("getProjectStructure", () => {
        it("should return CLI structure for CLI project type", async () => {
            // Act
            const structure = await getProjectStructure("CLI");

            // Assert
            expect(structure).toBeDefined();
            expect(structure?.nodes).toBeDefined();
            expect(structure?.nodes.length).toBeGreaterThan(0);
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
            const structure = await getProjectStructure("REST API");

            // Assert
            expect(structure).toBeDefined();
            expect(structure?.nodes).toBeDefined();
            expect(structure?.nodes.length).toBeGreaterThan(0);
        });

        it("should return undefined for GraphQL API project type (not yet defined)", async () => {
            // Act
            const structure = await getProjectStructure("GraphQL API");

            // Assert
            expect(structure).toBeUndefined();
        });
    });
});
