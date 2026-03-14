// biome-ignore-all lint/style/useNamingConvention: env var names use UPPER_SNAKE_CASE
import Chance from "chance";
import { describe, expect, it } from "vitest";
import { detectActor } from "../src/actor.js";

const chance = new Chance();

describe("Actor detection", () => {
    describe("given AGENTSHELL_ACTOR is set", () => {
        it("returns the override value", () => {
            // Arrange
            const overrideValue = chance.word();
            const env = { AGENTSHELL_ACTOR: overrideValue };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe(overrideValue);
        });

        it("returns the override even when CI indicators are present", () => {
            // Arrange
            const overrideValue = chance.word();
            const env = {
                AGENTSHELL_ACTOR: overrideValue,
                GITHUB_ACTIONS: "true",
            };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe(overrideValue);
        });

        it("returns the override even when agent indicators are present", () => {
            // Arrange
            const overrideValue = chance.word();
            const env = {
                AGENTSHELL_ACTOR: overrideValue,
                CLAUDE_CODE: "1",
            };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe(overrideValue);
        });
    });

    describe("given CI environment", () => {
        it("returns ci when GITHUB_ACTIONS is true", () => {
            // Arrange
            const env = { GITHUB_ACTIONS: "true" };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("ci");
        });

        it("returns ci even when agent indicators are present", () => {
            // Arrange
            const env = {
                GITHUB_ACTIONS: "true",
                CLAUDE_CODE: "1",
                COPILOT_AGENT: "1",
            };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("ci");
        });
    });

    describe("given coding agent environment", () => {
        it("returns claude-code when CLAUDE_CODE is set", () => {
            // Arrange
            const env = { CLAUDE_CODE: "1" };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("claude-code");
        });

        it("returns copilot when COPILOT_AGENT is set", () => {
            // Arrange
            const env = { COPILOT_AGENT: "1" };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("copilot");
        });

        it("returns copilot when COPILOT_CLI is set", () => {
            // Arrange
            const env = { COPILOT_CLI: "1" };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("copilot");
        });

        it("returns copilot when COPILOT_CLI_BINARY_VERSION is set", () => {
            // Arrange
            const env = { COPILOT_CLI_BINARY_VERSION: "1.0.4" };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("copilot");
        });

        it("returns copilot when both COPILOT_CLI and COPILOT_CLI_BINARY_VERSION are set", () => {
            // Arrange
            const env = {
                COPILOT_CLI: "1",
                COPILOT_CLI_BINARY_VERSION: "1.0.4",
            };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("copilot");
        });
    });

    describe("given no indicators", () => {
        it("returns human as fallback for empty env", () => {
            // Arrange
            const env = {};

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("human");
        });

        it("returns human when only unrelated vars are set", () => {
            // Arrange
            const env = {
                HOME: chance.word(),
                PATH: chance.word(),
                NODE_ENV: "production",
            };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("human");
        });
    });

    describe("priority ordering", () => {
        it("explicit override takes highest priority over all indicators", () => {
            // Arrange
            const overrideValue = chance.word();
            const env = {
                AGENTSHELL_ACTOR: overrideValue,
                GITHUB_ACTIONS: "true",
                CLAUDE_CODE: "1",
                COPILOT_AGENT: "1",
            };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe(overrideValue);
        });

        it("CI takes priority over agent when no explicit override", () => {
            // Arrange
            const env = {
                GITHUB_ACTIONS: "true",
                CLAUDE_CODE: "1",
                COPILOT_AGENT: "1",
            };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("ci");
        });

        it("claude-code takes priority over copilot when both are set", () => {
            // Arrange
            const env = {
                CLAUDE_CODE: "1",
                COPILOT_AGENT: "1",
            };

            // Act
            const result = detectActor(env);

            // Assert
            expect(result).toBe("claude-code");
        });
    });
});
