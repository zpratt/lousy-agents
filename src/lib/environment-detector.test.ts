import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    detectEnvironment,
    SUPPORTED_VERSION_FILES,
} from "./environment-detector.js";

const chance = new Chance();

describe("Environment detector", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-env-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when detecting mise.toml", () => {
        it("should return hasMise true when mise.toml exists", async () => {
            // Arrange
            const miseTomlPath = join(testDir, "mise.toml");
            await writeFile(miseTomlPath, "[tools]\nnode = '20'");

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.hasMise).toBe(true);
        });

        it("should return hasMise false when mise.toml does not exist", async () => {
            // Arrange - empty directory

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.hasMise).toBe(false);
        });
    });

    describe("when detecting .nvmrc", () => {
        it("should detect .nvmrc file with version content", async () => {
            // Arrange
            const nodeVersion = "20.11.0";
            await writeFile(join(testDir, ".nvmrc"), nodeVersion);

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.versionFiles).toContainEqual({
                type: "node",
                filename: ".nvmrc",
                version: nodeVersion,
            });
        });

        it("should trim whitespace from version content", async () => {
            // Arrange
            const nodeVersion = "20.11.0";
            await writeFile(join(testDir, ".nvmrc"), `  ${nodeVersion}  \n`);

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.versionFiles).toContainEqual({
                type: "node",
                filename: ".nvmrc",
                version: nodeVersion,
            });
        });
    });

    describe("when detecting .node-version", () => {
        it("should detect .node-version file with version content", async () => {
            // Arrange
            const nodeVersion = "18.19.0";
            await writeFile(join(testDir, ".node-version"), nodeVersion);

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.versionFiles).toContainEqual({
                type: "node",
                filename: ".node-version",
                version: nodeVersion,
            });
        });
    });

    describe("when detecting .python-version", () => {
        it("should detect .python-version file with version content", async () => {
            // Arrange
            const pythonVersion = "3.12.1";
            await writeFile(join(testDir, ".python-version"), pythonVersion);

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.versionFiles).toContainEqual({
                type: "python",
                filename: ".python-version",
                version: pythonVersion,
            });
        });
    });

    describe("when detecting .java-version", () => {
        it("should detect .java-version file with version content", async () => {
            // Arrange
            const javaVersion = "21";
            await writeFile(join(testDir, ".java-version"), javaVersion);

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.versionFiles).toContainEqual({
                type: "java",
                filename: ".java-version",
                version: javaVersion,
            });
        });
    });

    describe("when detecting .ruby-version", () => {
        it("should detect .ruby-version file with version content", async () => {
            // Arrange
            const rubyVersion = "3.3.0";
            await writeFile(join(testDir, ".ruby-version"), rubyVersion);

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.versionFiles).toContainEqual({
                type: "ruby",
                filename: ".ruby-version",
                version: rubyVersion,
            });
        });
    });

    describe("when detecting .go-version", () => {
        it("should detect .go-version file with version content", async () => {
            // Arrange
            const goVersion = "1.22.0";
            await writeFile(join(testDir, ".go-version"), goVersion);

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.versionFiles).toContainEqual({
                type: "go",
                filename: ".go-version",
                version: goVersion,
            });
        });
    });

    describe("when detecting multiple version files", () => {
        it("should detect all present version files", async () => {
            // Arrange
            const nodeVersion = "20.11.0";
            const pythonVersion = "3.12.1";
            await writeFile(join(testDir, ".nvmrc"), nodeVersion);
            await writeFile(join(testDir, ".python-version"), pythonVersion);

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.versionFiles).toHaveLength(2);
            expect(result.versionFiles).toContainEqual({
                type: "node",
                filename: ".nvmrc",
                version: nodeVersion,
            });
            expect(result.versionFiles).toContainEqual({
                type: "python",
                filename: ".python-version",
                version: pythonVersion,
            });
        });

        it("should detect both .nvmrc and .node-version if both exist", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20");
            await writeFile(join(testDir, ".node-version"), "18");

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            const nodeFiles = result.versionFiles.filter(
                (f) => f.type === "node",
            );
            expect(nodeFiles).toHaveLength(2);
        });
    });

    describe("when no configuration files exist", () => {
        it("should return empty result", async () => {
            // Arrange - empty directory

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.hasMise).toBe(false);
            expect(result.versionFiles).toHaveLength(0);
        });
    });

    describe("when version file is empty", () => {
        it("should detect file but version should be undefined", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "");

            // Act
            const result = await detectEnvironment(testDir);

            // Assert
            expect(result.versionFiles).toContainEqual({
                type: "node",
                filename: ".nvmrc",
                version: undefined,
            });
        });
    });

    describe("SUPPORTED_VERSION_FILES constant", () => {
        it("should contain all expected version file names", () => {
            // Arrange
            const expectedFiles = [
                ".nvmrc",
                ".node-version",
                ".python-version",
                ".java-version",
                ".ruby-version",
                ".go-version",
            ];

            // Assert
            for (const file of expectedFiles) {
                expect(SUPPORTED_VERSION_FILES).toContain(file);
            }
        });
    });
});
