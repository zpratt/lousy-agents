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

describe("Environment Detector", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-env-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("detectEnvironment", () => {
        describe("when detecting mise.toml", () => {
            it("should detect mise.toml when present in repository root", async () => {
                // Arrange
                const miseTomlPath = join(testDir, "mise.toml");
                await writeFile(miseTomlPath, '[tools]\nnode = "20.0.0"');

                // Act
                const result = await detectEnvironment(testDir);

                // Assert
                expect(result.hasMise).toBe(true);
            });

            it("should return hasMise as false when mise.toml is not present", async () => {
                // Arrange - empty directory (done in beforeEach)

                // Act
                const result = await detectEnvironment(testDir);

                // Assert
                expect(result.hasMise).toBe(false);
            });
        });

        describe("when detecting .nvmrc", () => {
            it("should detect .nvmrc when present and return its content", async () => {
                // Arrange
                const nodeVersion = "20.12.0";
                const nvmrcPath = join(testDir, ".nvmrc");
                await writeFile(nvmrcPath, nodeVersion);

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
                const nodeVersion = "20.12.0";
                const nvmrcPath = join(testDir, ".nvmrc");
                await writeFile(nvmrcPath, `  ${nodeVersion}  \n`);

                // Act
                const result = await detectEnvironment(testDir);

                // Assert
                const nvmrcFile = result.versionFiles.find(
                    (f) => f.filename === ".nvmrc",
                );
                expect(nvmrcFile?.version).toBe(nodeVersion);
            });
        });

        describe("when detecting .node-version", () => {
            it("should detect .node-version when present", async () => {
                // Arrange
                const nodeVersion = "18.19.0";
                const nodeVersionPath = join(testDir, ".node-version");
                await writeFile(nodeVersionPath, nodeVersion);

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
            it("should detect .python-version when present", async () => {
                // Arrange
                const pythonVersion = "3.12.0";
                const pythonVersionPath = join(testDir, ".python-version");
                await writeFile(pythonVersionPath, pythonVersion);

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
            it("should detect .java-version when present", async () => {
                // Arrange
                const javaVersion = "21";
                const javaVersionPath = join(testDir, ".java-version");
                await writeFile(javaVersionPath, javaVersion);

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
            it("should detect .ruby-version when present", async () => {
                // Arrange
                const rubyVersion = "3.3.0";
                const rubyVersionPath = join(testDir, ".ruby-version");
                await writeFile(rubyVersionPath, rubyVersion);

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
            it("should detect .go-version when present", async () => {
                // Arrange
                const goVersion = "1.22.0";
                const goVersionPath = join(testDir, ".go-version");
                await writeFile(goVersionPath, goVersion);

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

        describe("when no configuration files exist", () => {
            it("should return empty result when no configuration files are present", async () => {
                // Arrange - empty directory (done in beforeEach)

                // Act
                const result = await detectEnvironment(testDir);

                // Assert
                expect(result.hasMise).toBe(false);
                expect(result.versionFiles).toHaveLength(0);
            });
        });

        describe("when multiple version files exist", () => {
            it("should detect all present version files", async () => {
                // Arrange
                await writeFile(join(testDir, ".nvmrc"), "20.0.0");
                await writeFile(join(testDir, ".python-version"), "3.12.0");
                await writeFile(join(testDir, ".ruby-version"), "3.3.0");

                // Act
                const result = await detectEnvironment(testDir);

                // Assert
                expect(result.versionFiles).toHaveLength(3);
                expect(result.versionFiles.map((f) => f.type)).toContain(
                    "node",
                );
                expect(result.versionFiles.map((f) => f.type)).toContain(
                    "python",
                );
                expect(result.versionFiles.map((f) => f.type)).toContain(
                    "ruby",
                );
            });

            it("should detect mise.toml alongside version files", async () => {
                // Arrange
                await writeFile(
                    join(testDir, "mise.toml"),
                    '[tools]\nnode = "20"',
                );
                await writeFile(join(testDir, ".nvmrc"), "20.0.0");

                // Act
                const result = await detectEnvironment(testDir);

                // Assert
                expect(result.hasMise).toBe(true);
                expect(result.versionFiles).toHaveLength(1);
            });
        });
    });

    describe("SUPPORTED_VERSION_FILES", () => {
        it("should include all expected version file names", () => {
            // Assert
            expect(SUPPORTED_VERSION_FILES).toContain(".nvmrc");
            expect(SUPPORTED_VERSION_FILES).toContain(".node-version");
            expect(SUPPORTED_VERSION_FILES).toContain(".python-version");
            expect(SUPPORTED_VERSION_FILES).toContain(".java-version");
            expect(SUPPORTED_VERSION_FILES).toContain(".ruby-version");
            expect(SUPPORTED_VERSION_FILES).toContain(".go-version");
        });
    });
});
