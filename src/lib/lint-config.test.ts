import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LINT_RULES } from "../entities/lint-rules.js";
import { loadLintConfig } from "./lint-config.js";

vi.mock("c12", () => ({
    loadConfig: vi.fn(),
}));

import { loadConfig } from "c12";

const mockedLoadConfig = vi.mocked(loadConfig);

describe("loadLintConfig", () => {
    describe("given no configuration file exists", () => {
        it("should return default lint rules", async () => {
            // Arrange
            mockedLoadConfig.mockResolvedValue({
                config: {},
                configFile: "",
                layers: [],
                cwd: "/repo",
            });

            // Act
            const result = await loadLintConfig("/repo");

            // Assert
            expect(result).toEqual(DEFAULT_LINT_RULES);
        });
    });

    describe("given a configuration file with partial overrides", () => {
        it("should merge overrides with defaults", async () => {
            // Arrange
            mockedLoadConfig.mockResolvedValue({
                config: {
                    lint: {
                        rules: {
                            agents: {
                                "agent/invalid-field": "off",
                            },
                        },
                    },
                },
                configFile: "lousy-agents.config.ts",
                layers: [],
                cwd: "/repo",
            });

            // Act
            const result = await loadLintConfig("/repo");

            // Assert
            expect(result.agents["agent/invalid-field"]).toBe("off");
            expect(result.agents["agent/missing-frontmatter"]).toBe("error");
            expect(result.instructions["instruction/parse-error"]).toBe("warn");
            expect(result.skills["skill/missing-name"]).toBe("error");
        });
    });

    describe("given a configuration file with overrides across all targets", () => {
        it("should apply overrides for each target independently", async () => {
            // Arrange
            mockedLoadConfig.mockResolvedValue({
                config: {
                    lint: {
                        rules: {
                            agents: {
                                "agent/name-mismatch": "off",
                            },
                            instructions: {
                                "instruction/command-outside-section": "off",
                            },
                            skills: {
                                "skill/missing-allowed-tools": "error",
                            },
                        },
                    },
                },
                configFile: "lousy-agents.config.ts",
                layers: [],
                cwd: "/repo",
            });

            // Act
            const result = await loadLintConfig("/repo");

            // Assert
            expect(result.agents["agent/name-mismatch"]).toBe("off");
            expect(
                result.instructions["instruction/command-outside-section"],
            ).toBe("off");
            expect(result.skills["skill/missing-allowed-tools"]).toBe("error");
        });
    });

    describe("given a configuration file with unknown rule IDs", () => {
        it("should discard unknown rules after validation", async () => {
            // Arrange
            mockedLoadConfig.mockResolvedValue({
                config: {
                    lint: {
                        rules: {
                            agents: {
                                "agent/unknown-rule": "warn",
                                "agent/missing-name": "off",
                            },
                        },
                    },
                },
                configFile: "lousy-agents.config.ts",
                layers: [],
                cwd: "/repo",
            });

            // Act
            const result = await loadLintConfig("/repo");

            // Assert
            expect(result.agents["agent/missing-name"]).toBe("off");
            expect(result.agents["agent/unknown-rule"]).toBeUndefined();
        });
    });

    describe("given a configuration file with an invalid severity value", () => {
        it("should throw a validation error", async () => {
            // Arrange
            mockedLoadConfig.mockResolvedValue({
                config: {
                    lint: {
                        rules: {
                            agents: {
                                "agent/missing-name": "fatal",
                            },
                        },
                    },
                },
                configFile: "lousy-agents.config.ts",
                layers: [],
                cwd: "/repo",
            });

            // Act & Assert
            await expect(loadLintConfig("/repo")).rejects.toThrow();
        });
    });

    describe("given a configuration file with invalid rule ID format", () => {
        it("should throw a validation error for keys not matching the rule ID pattern", async () => {
            // Arrange
            mockedLoadConfig.mockResolvedValue({
                config: {
                    lint: {
                        rules: {
                            agents: {
                                "not-a/valid/rule": "error",
                            },
                        },
                    },
                },
                configFile: "lousy-agents.config.ts",
                layers: [],
                cwd: "/repo",
            });

            // Act & Assert
            await expect(loadLintConfig("/repo")).rejects.toThrow();
        });
    });

    describe("given c12 loadConfig throws an error", () => {
        it("should propagate the error", async () => {
            // Arrange
            mockedLoadConfig.mockRejectedValue(
                new Error("EACCES: permission denied"),
            );

            // Act & Assert
            await expect(loadLintConfig("/repo")).rejects.toThrow(
                "EACCES: permission denied",
            );
        });
    });

    describe("given a configuration file without a lint key", () => {
        it("should return default lint rules", async () => {
            // Arrange
            mockedLoadConfig.mockResolvedValue({
                config: {
                    structures: {},
                },
                configFile: "lousy-agents.config.ts",
                layers: [],
                cwd: "/repo",
            });

            // Act
            const result = await loadLintConfig("/repo");

            // Assert
            expect(result).toEqual(DEFAULT_LINT_RULES);
        });
    });

    describe("given a configuration file without a rules key under lint", () => {
        it("should return default lint rules", async () => {
            // Arrange
            mockedLoadConfig.mockResolvedValue({
                config: {
                    lint: {},
                },
                configFile: "lousy-agents.config.ts",
                layers: [],
                cwd: "/repo",
            });

            // Act
            const result = await loadLintConfig("/repo");

            // Assert
            expect(result).toEqual(DEFAULT_LINT_RULES);
        });
    });

    it("should pass cwd as targetDir to c12 loadConfig", async () => {
        // Arrange
        const targetDir = "/my/project";
        mockedLoadConfig.mockResolvedValue({
            config: {},
            configFile: "",
            layers: [],
            cwd: targetDir,
        });

        // Act
        await loadLintConfig(targetDir);

        // Assert
        expect(mockedLoadConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "lousy-agents",
                cwd: targetDir,
            }),
        );
    });
});
