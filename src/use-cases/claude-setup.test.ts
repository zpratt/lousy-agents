/**
 * Tests for Claude Code setup use cases
 */

import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { ClaudeSettings } from "../entities/claude-setup.js";
import type { DetectedEnvironment } from "../entities/copilot-setup.js";
import {
    buildSessionStartHooks,
    generateEnvironmentSetupSection,
    mergeClaudeDocumentation,
    mergeClaudeSettings,
} from "./claude-setup.js";

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

        describe("when version file has unsafe filename", () => {
            it("should skip version file with shell metacharacters", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "python",
                            filename: ".python-version; rm -rf /",
                            version: "3.11.0",
                        },
                    ],
                    packageManagers: [],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(0);
            });

            it("should skip version file with command substitution", async () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "ruby",
                            filename: "$(malicious)",
                            version: "3.2.0",
                        },
                    ],
                    packageManagers: [],
                };

                // Act
                const hooks = await buildSessionStartHooks(environment);

                // Assert
                expect(hooks).toHaveLength(0);
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
                expect(hooks[0].command).toBe("yarn install --frozen-lockfile");
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
                expect(hooks[0].command).toBe("pnpm install --frozen-lockfile");
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

    describe("mergeClaudeSettings", () => {
        describe("when no existing settings exist", () => {
            it("should create new settings with SessionStart hooks", () => {
                // Arrange
                const hooks = [
                    {
                        command: "nvm install",
                        description: "Install Node.js",
                    },
                    {
                        command: "npm ci",
                        description: "Install dependencies",
                    },
                ];

                // Act
                const merged = mergeClaudeSettings(null, hooks);

                // Assert
                expect(merged.SessionStart).toEqual(["nvm install", "npm ci"]);
            });
        });

        describe("when existing settings have no SessionStart", () => {
            it("should add SessionStart array", () => {
                // Arrange
                const existing: ClaudeSettings = {
                    enabledPlugins: { "test@example": true },
                };
                const hooks = [
                    {
                        command: "nvm install",
                    },
                ];

                // Act
                const merged = mergeClaudeSettings(existing, hooks);

                // Assert
                expect(merged.SessionStart).toEqual(["nvm install"]);
                expect(merged.enabledPlugins).toEqual({ "test@example": true });
            });
        });

        describe("when existing settings have SessionStart", () => {
            it("should merge hooks without duplication", () => {
                // Arrange
                const existing: ClaudeSettings = {
                    // biome-ignore lint/style/useNamingConvention: SessionStart is the Claude Code API property name
                    SessionStart: ["nvm install"],
                };
                const hooks = [
                    {
                        command: "nvm install", // duplicate
                    },
                    {
                        command: "npm ci", // new
                    },
                ];

                // Act
                const merged = mergeClaudeSettings(existing, hooks);

                // Assert - verify exact order: tool-generated commands first, duplicates removed
                expect(merged.SessionStart).toEqual(["nvm install", "npm ci"]);
            });
        });

        describe("when existing settings have other properties", () => {
            it("should preserve all non-SessionStart properties", () => {
                // Arrange
                const pluginSettings = {
                    "plugin1@example": true,
                    "plugin2@example": false,
                };
                const existing: ClaudeSettings = {
                    // biome-ignore lint/style/useNamingConvention: SessionStart is the Claude Code API property name
                    SessionStart: ["existing command"],
                    enabledPlugins: pluginSettings,
                    customProperty: "custom value",
                };
                const hooks = [
                    {
                        command: "new command",
                    },
                ];

                // Act
                const merged = mergeClaudeSettings(existing, hooks);

                // Assert
                expect(merged.enabledPlugins).toEqual(pluginSettings);
                expect(merged.customProperty).toBe("custom value");
                expect(merged.SessionStart).toContain("existing command");
                expect(merged.SessionStart).toContain("new command");
            });
        });

        describe("when merging empty hooks array", () => {
            it("should preserve existing SessionStart", () => {
                // Arrange
                const existing: ClaudeSettings = {
                    // biome-ignore lint/style/useNamingConvention: SessionStart is the Claude Code API property name
                    SessionStart: ["existing command"],
                };

                // Act
                const merged = mergeClaudeSettings(existing, []);

                // Assert
                expect(merged.SessionStart).toEqual(["existing command"]);
            });
        });

        describe("when existing SessionStart has dependency command and hooks add runtime setup", () => {
            it("should place tool-generated runtime setup before existing dependency command", () => {
                // Arrange
                const existing: ClaudeSettings = {
                    // biome-ignore lint/style/useNamingConvention: SessionStart is the Claude Code API property name
                    SessionStart: ["npm ci"],
                };
                const hooks = [
                    {
                        command: "nvm install",
                        description: "Install Node via nvm",
                    },
                    {
                        command: "npm ci",
                        description: "Install dependencies",
                    },
                ];

                // Act
                const merged = mergeClaudeSettings(existing, hooks);

                // Assert - verify runtime (nvm) before dependencies (npm ci), no duplication
                expect(merged.SessionStart).toEqual(["nvm install", "npm ci"]);
            });
        });
    });

    describe("generateEnvironmentSetupSection", () => {
        describe("when environment has mise", () => {
            it("should document mise usage", () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: true,
                    versionFiles: [],
                    packageManagers: [],
                };
                const hooks = [
                    {
                        command: "mise install",
                        description: "Install runtimes from mise.toml",
                    },
                ];

                // Act
                const section = generateEnvironmentSetupSection(
                    environment,
                    hooks,
                );

                // Assert
                expect(section).toContain("## Environment Setup");
                expect(section).toContain("mise");
                expect(section).toContain("mise install");
            });
        });

        describe("when environment has version files", () => {
            it("should list detected runtimes with versions", () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [
                        {
                            type: "node",
                            filename: ".nvmrc",
                            version: "18.0.0",
                        },
                        {
                            type: "python",
                            filename: ".python-version",
                            version: "3.11.0",
                        },
                    ],
                    packageManagers: [],
                };

                // Act
                const section = generateEnvironmentSetupSection(
                    environment,
                    [],
                );

                // Assert
                expect(section).toContain("### Detected Runtimes");
                expect(section).toContain("**node**: .nvmrc (18.0.0)");
                expect(section).toContain(
                    "**python**: .python-version (3.11.0)",
                );
            });
        });

        describe("when environment has package managers", () => {
            it("should list detected package managers with lockfiles", () => {
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
                const section = generateEnvironmentSetupSection(
                    environment,
                    [],
                );

                // Assert
                expect(section).toContain("### Package Managers");
                expect(section).toContain(
                    "**npm**: package.json with package-lock.json",
                );
            });
        });

        describe("when hooks are provided", () => {
            it("should document SessionStart hooks with descriptions", () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [],
                };
                const hooks = [
                    {
                        command: "nvm install",
                        description: "Install Node.js from .nvmrc",
                    },
                    {
                        command: "npm ci",
                        description: "Install Node.js dependencies",
                    },
                ];

                // Act
                const section = generateEnvironmentSetupSection(
                    environment,
                    hooks,
                );

                // Assert
                expect(section).toContain("### SessionStart Hooks");
                expect(section).toContain("```bash");
                expect(section).toContain("nvm install");
                expect(section).toContain("npm ci");
                expect(section).toContain("*Install Node.js from .nvmrc*");
                expect(section).toContain("*Install Node.js dependencies*");
            });
        });

        describe("when no environment is detected", () => {
            it("should document no configuration with helpful message", () => {
                // Arrange
                const environment: DetectedEnvironment = {
                    hasMise: false,
                    versionFiles: [],
                    packageManagers: [],
                };

                // Act
                const section = generateEnvironmentSetupSection(
                    environment,
                    [],
                );

                // Assert
                expect(section).toContain("## Environment Setup");
                expect(section).toContain(
                    "No environment-specific configuration detected",
                );
                expect(section).toContain("version files");
            });
        });
    });

    describe("mergeClaudeDocumentation", () => {
        describe("when no existing documentation exists", () => {
            it("should create new documentation with setup section", () => {
                // Arrange
                const setupSection = "## Environment Setup\n\nTest content";

                // Act
                const merged = mergeClaudeDocumentation(null, setupSection);

                // Assert
                expect(merged).toContain("# Claude Code Environment");
                expect(merged).toContain("## Environment Setup");
                expect(merged).toContain("Test content");
            });
        });

        describe("when documentation exists without Environment Setup section", () => {
            it("should append setup section", () => {
                // Arrange
                const existing =
                    "# My Project\n\nSome content\n\n## Other Section\n\nOther content";
                const setupSection = "## Environment Setup\n\nSetup content";

                // Act
                const merged = mergeClaudeDocumentation(existing, setupSection);

                // Assert
                expect(merged).toContain("# My Project");
                expect(merged).toContain("## Other Section");
                expect(merged).toContain("## Environment Setup");
                expect(merged.indexOf("## Other Section")).toBeLessThan(
                    merged.indexOf("## Environment Setup"),
                );
            });
        });

        describe("when documentation exists with Environment Setup section", () => {
            it("should replace existing section", () => {
                // Arrange
                const existing =
                    "# My Project\n\n## Environment Setup\n\nOld setup content\n\n## Other Section\n\nOther content";
                const setupSection =
                    "## Environment Setup\n\nNew setup content";

                // Act
                const merged = mergeClaudeDocumentation(existing, setupSection);

                // Assert
                expect(merged).toContain("New setup content");
                expect(merged).not.toContain("Old setup content");
                expect(merged).toContain("## Other Section");
            });
        });

        describe("when Environment Setup is last section", () => {
            it("should replace section at end", () => {
                // Arrange
                const existing =
                    "# My Project\n\n## Other Section\n\nContent\n\n## Environment Setup\n\nOld content";
                const setupSection = "## Environment Setup\n\nNew content";

                // Act
                const merged = mergeClaudeDocumentation(existing, setupSection);

                // Assert
                expect(merged).toContain("New content");
                expect(merged).not.toContain("Old content");
            });
        });
    });
});
