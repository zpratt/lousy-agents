/**
 * Tests for Claude Code setup use cases
 */

import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { DetectedEnvironment } from "../entities/copilot-setup.js";
import { buildSessionStartHooks } from "./claude-setup.js";

const chance = new Chance();

describe("Claude Setup Use Cases", () => {
    describe("buildSessionStartHooks", () => {
        describe("when mise.toml is detected", () => {
            it("should generate mise install hook", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: true,
                    versionFiles: [],
                    packageManagers: [],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe("mise install");
                expect(hooks[0].description).toBe(
                    "Install runtimes from mise.toml",
                );
            });

            it("should include package manager hooks after mise install", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: true,
                    versionFiles: [],
                    packageManagers: [
                        {
                            type: "npm",
                            filename: "package.json",
                            lockfile: "package-lock.json",
                        },
                    ],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(2);
                expect(hooks[0].command).toBe("mise install");
                expect(hooks[1].command).toBe("npm ci");
            });
        });

        describe("when .nvmrc is detected", () => {
            it("should generate nvm install hook", async () => {
                // Arrange
                const nvmrcVersion = chance.semver();
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "node",
                            filename: ".nvmrc",
                            version: nvmrcVersion,
                        },
                    ],
                    packageManagers: [],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe("nvm install");
                expect(hooks[0].description).toContain(".nvmrc");
                expect(hooks[0].description).toContain(nvmrcVersion);
            });
        });

        describe("when .node-version is detected", () => {
            it("should generate nvm install hook", async () => {
                // Arrange
                const nodeVersion = chance.semver();
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "node",
                            filename: ".node-version",
                            version: nodeVersion,
                        },
                    ],
                    packageManagers: [],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe("nvm install");
                expect(hooks[0].description).toContain(".node-version");
            });
        });

        describe("when .python-version is detected", () => {
            it("should generate pyenv install hook", async () => {
                // Arrange
                const pythonVersion = "3.11.0";
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "python",
                            filename: ".python-version",
                            version: pythonVersion,
                        },
                    ],
                    packageManagers: [],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe(
                    "pyenv install -s $(cat .python-version)",
                );
                expect(hooks[0].description).toContain(".python-version");
                expect(hooks[0].description).toContain(pythonVersion);
            });
        });

        describe("when .ruby-version is detected", () => {
            it("should generate rbenv install hook", async () => {
                // Arrange
                const rubyVersion = "3.2.0";
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "ruby",
                            filename: ".ruby-version",
                            version: rubyVersion,
                        },
                    ],
                    packageManagers: [],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe(
                    "rbenv install -s $(cat .ruby-version)",
                );
                expect(hooks[0].description).toContain(".ruby-version");
            });
        });

        describe("when multiple version files of same type are detected", () => {
            it("should deduplicate by type", async () => {
                // Arrange - both .nvmrc and .node-version
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "node",
                            filename: ".nvmrc",
                            version: "18.0.0",
                        },
                        {
                            type: "node",
                            filename: ".node-version",
                            version: "18.0.0",
                        },
                    ],
                    packageManagers: [],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe("nvm install");
            });
        });

        describe("when npm with package-lock.json is detected", () => {
            it("should generate npm ci hook", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [
                        {
                            type: "npm",
                            filename: "package.json",
                            lockfile: "package-lock.json",
                        },
                    ],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe("npm ci");
                expect(hooks[0].description).toContain("Node.js dependencies");
                expect(hooks[0].description).toContain("package-lock.json");
            });
        });

        describe("when yarn with yarn.lock is detected", () => {
            it("should generate yarn install --frozen-lockfile hook", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [
                        {
                            type: "yarn",
                            filename: "package.json",
                            lockfile: "yarn.lock",
                        },
                    ],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe(
                    "yarn install --frozen-lockfile",
                );
                expect(hooks[0].description).toContain("Node.js dependencies");
            });
        });

        describe("when pnpm with pnpm-lock.yaml is detected", () => {
            it("should generate pnpm install --frozen-lockfile hook", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [
                        {
                            type: "pnpm",
                            filename: "package.json",
                            lockfile: "pnpm-lock.yaml",
                        },
                    ],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe(
                    "pnpm install --frozen-lockfile",
                );
            });
        });

        describe("when requirements.txt is detected", () => {
            it("should generate pip install hook", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [
                        {
                            type: "pip",
                            filename: "requirements.txt",
                        },
                    ],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe(
                    "pip install -r requirements.txt",
                );
                expect(hooks[0].description).toContain("Python dependencies");
            });
        });

        describe("when Pipfile is detected", () => {
            it("should generate pipenv install hook", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [
                        {
                            type: "pipenv",
                            filename: "Pipfile",
                            lockfile: "Pipfile.lock",
                        },
                    ],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe("pipenv install --deploy");
            });
        });

        describe("when pyproject.toml with poetry.lock is detected", () => {
            it("should generate poetry install hook", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [
                        {
                            type: "poetry",
                            filename: "pyproject.toml",
                            lockfile: "poetry.lock",
                        },
                    ],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
                expect(hooks[0].command).toBe("poetry install --no-root");
            });
        });

        describe("when version file and package manager are both detected", () => {
            it("should generate hooks in order: runtime then dependencies", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "node",
                            filename: ".nvmrc",
                            version: "18.0.0",
                        },
                    ],
                    packageManagers: [
                        {
                            type: "npm",
                            filename: "package.json",
                            lockfile: "package-lock.json",
                        },
                    ],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(2);
                expect(hooks[0].command).toBe("nvm install");
                expect(hooks[1].command).toBe("npm ci");
            });
        });

        describe("when no environment is detected", () => {
            it("should return empty hooks array", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(0);
            });
        });

        describe("when multiple package managers are detected", () => {
            it("should deduplicate by type", async () => {
                // Arrange - this scenario shouldn't happen in reality but tests the logic
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [
                        {
                            type: "npm",
                            filename: "package.json",
                            lockfile: "package-lock.json",
                        },
                        {
                            type: "npm",
                            filename: "package.json",
                            lockfile: "package-lock.json",
                        },
                    ],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(1);
            });
        });
    });
});
