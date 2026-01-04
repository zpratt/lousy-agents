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

        it("should return undefined for webapp project type (not yet defined)", async () => {
            // Act
            const structure = await getProjectStructure("webapp");

            // Assert
            expect(structure).toBeUndefined();
        });

        it("should return undefined for REST API project type (not yet defined)", async () => {
            // Act
            const structure = await getProjectStructure("REST API");

            // Assert
            expect(structure).toBeUndefined();
        });

        it("should return undefined for GraphQL API project type (not yet defined)", async () => {
            // Act
            const structure = await getProjectStructure("GraphQL API");

            // Assert
            expect(structure).toBeUndefined();
        });
    });
});
