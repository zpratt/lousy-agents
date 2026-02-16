/**
 * Tests for Claude Code setup entities
 */

import Chance from "chance";
import { describe, expect, it } from "vitest";
import type {
    ClaudeEnvironmentRecommendation,
    ClaudeSettings,
    ClaudeSetupAction,
    ClaudeSetupResult,
    SessionStartHook,
} from "./claude-setup.js";
import type { DetectedEnvironment } from "./copilot-setup.js";

const chance = new Chance();

describe("Claude Setup Entities", () => {
    describe("SessionStartHook", () => {
        it("should have command property", () => {
            const hook: SessionStartHook = {
                command: "nvm install",
            };

            expect(hook.command).toBe("nvm install");
        });

        it("should have optional description property", () => {
            const hook: SessionStartHook = {
                command: "nvm install",
                description: "Install Node.js version from .nvmrc",
            };

            expect(hook.description).toBe(
                "Install Node.js version from .nvmrc",
            );
        });
    });

    describe("ClaudeSettings", () => {
        it("should allow SessionStart array", () => {
            const settings: ClaudeSettings = {
                SessionStart: ["nvm install", "npm ci"],
            };

            expect(settings.SessionStart).toHaveLength(2);
        });

        it("should allow additional properties", () => {
            const settings: ClaudeSettings = {
                SessionStart: ["nvm install"],
                enabledPlugins: { "test@example": true },
                customSetting: "value",
            };

            expect(settings.enabledPlugins).toEqual({ "test@example": true });
            expect(settings.customSetting).toBe("value");
        });

        it("should allow settings without SessionStart", () => {
            const settings: ClaudeSettings = {
                enabledPlugins: { "test@example": true },
            };

            expect(settings.SessionStart).toBeUndefined();
        });
    });

    describe("ClaudeSetupAction", () => {
        it("should accept created action", () => {
            const action: ClaudeSetupAction = "created";
            expect(action).toBe("created");
        });

        it("should accept updated action", () => {
            const action: ClaudeSetupAction = "updated";
            expect(action).toBe("updated");
        });

        it("should accept no_changes_needed action", () => {
            const action: ClaudeSetupAction = "no_changes_needed";
            expect(action).toBe("no_changes_needed");
        });
    });

    describe("ClaudeEnvironmentRecommendation", () => {
        it("should have type and description", () => {
            const recommendation: ClaudeEnvironmentRecommendation = {
                type: "network_access",
                description: "Enable internet access for package installation",
            };

            expect(recommendation.type).toBe("network_access");
            expect(recommendation.description).toBe(
                "Enable internet access for package installation",
            );
        });

        it("should support environment_variable type", () => {
            const recommendation: ClaudeEnvironmentRecommendation = {
                type: "environment_variable",
                description: "Set NODE_ENV=development",
            };

            expect(recommendation.type).toBe("environment_variable");
        });

        it("should support other type", () => {
            const recommendation: ClaudeEnvironmentRecommendation = {
                type: "other",
                description: chance.sentence(),
            };

            expect(recommendation.type).toBe("other");
        });
    });

    describe("ClaudeSetupResult", () => {
        it("should contain all required properties", () => {
            const environment: DetectedEnvironment = {
                hasMise: false,
                versionFiles: [],
                packageManagers: [],
            };
            const hooks: SessionStartHook[] = [
                {
                    command: "nvm install",
                    description: "Install Node.js",
                },
            ];
            const result: ClaudeSetupResult = {
                hooks,
                environment,
                settingsPath: ".claude/settings.json",
                documentationPath: "CLAUDE.md",
                action: "created",
            };

            expect(result.hooks).toEqual(hooks);
            expect(result.environment).toEqual(environment);
            expect(result.settingsPath).toBe(".claude/settings.json");
            expect(result.documentationPath).toBe("CLAUDE.md");
            expect(result.action).toBe("created");
        });

        it("should support optional recommendations", () => {
            const environment: DetectedEnvironment = {
                hasMise: false,
                versionFiles: [],
                packageManagers: [],
            };
            const recommendations: ClaudeEnvironmentRecommendation[] = [
                {
                    type: "network_access",
                    description: "Enable internet access",
                },
            ];
            const result: ClaudeSetupResult = {
                hooks: [],
                environment,
                settingsPath: ".claude/settings.json",
                documentationPath: "CLAUDE.md",
                action: "no_changes_needed",
                recommendations,
            };

            expect(result.recommendations).toEqual(recommendations);
        });
    });
});
