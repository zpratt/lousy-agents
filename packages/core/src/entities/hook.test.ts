import { describe, expect, it } from "vitest";
import {
    CopilotHookCommandSchema,
    CopilotHooksConfigSchema,
} from "./copilot-hook-schema.js";
import type {
    DiscoveredHookFile,
    HookLintDiagnostic,
    HookLintResult,
    HookLintSeverity,
    HookPlatform,
} from "./hook.js";

describe("Hook entity types", () => {
    describe("HookPlatform", () => {
        it("should accept copilot as a valid platform", () => {
            // Arrange
            const platform: HookPlatform = "copilot";

            // Assert
            expect(platform).toBe("copilot");
        });

        it("should accept claude as a valid platform", () => {
            // Arrange
            const platform: HookPlatform = "claude";

            // Assert
            expect(platform).toBe("claude");
        });
    });

    describe("HookLintSeverity", () => {
        it("should accept error and warning values", () => {
            // Arrange
            const severities: HookLintSeverity[] = ["error", "warning"];

            // Assert
            expect(severities).toHaveLength(2);
        });
    });

    describe("HookLintDiagnostic", () => {
        it("should represent a diagnostic with required fields", () => {
            // Arrange
            const diagnostic: HookLintDiagnostic = {
                line: 1,
                severity: "error",
                message: "Invalid configuration",
                ruleId: "hook/invalid-config",
            };

            // Assert
            expect(diagnostic.line).toBe(1);
            expect(diagnostic.severity).toBe("error");
            expect(diagnostic.message).toBe("Invalid configuration");
            expect(diagnostic.ruleId).toBe("hook/invalid-config");
            expect(diagnostic.field).toBeUndefined();
        });

        it("should support an optional field property", () => {
            // Arrange
            const diagnostic: HookLintDiagnostic = {
                line: 1,
                severity: "warning",
                message: "Missing field",
                field: "timeoutSec",
                ruleId: "hook/missing-timeout",
            };

            // Assert
            expect(diagnostic.field).toBe("timeoutSec");
        });
    });

    describe("HookLintResult", () => {
        it("should represent a lint result for a hook file", () => {
            // Arrange
            const result: HookLintResult = {
                filePath: "/repo/.github/copilot/hooks.json",
                platform: "copilot",
                diagnostics: [],
                valid: true,
            };

            // Assert
            expect(result.filePath).toBe("/repo/.github/copilot/hooks.json");
            expect(result.platform).toBe("copilot");
            expect(result.valid).toBe(true);
            expect(result.diagnostics).toHaveLength(0);
        });
    });

    describe("DiscoveredHookFile", () => {
        it("should represent a discovered hook configuration file", () => {
            // Arrange
            const hookFile: DiscoveredHookFile = {
                filePath: "/repo/.claude/settings.json",
                platform: "claude",
            };

            // Assert
            expect(hookFile.filePath).toBe("/repo/.claude/settings.json");
            expect(hookFile.platform).toBe("claude");
        });
    });
});

describe("CopilotHookCommandSchema", () => {
    describe("given a valid command with bash", () => {
        it("should parse successfully", () => {
            const result = CopilotHookCommandSchema.safeParse({
                type: "command",
                bash: "./check.sh",
            });
            expect(result.success).toBe(true);
        });
    });

    describe("given an env object with a prototype-polluting key", () => {
        it("should strip __proto__ from output so downstream spreads are safe", () => {
            // Zod 4 strips invalid record keys from the output rather than failing.
            // The important safety property is that __proto__ never appears in
            // validated output, so { ...hook.env } cannot pollute prototypes.
            const parsed = JSON.parse(
                '{"type":"command","bash":"./check.sh","env":{"__proto__":"polluted","VALID":"ok"}}',
            );
            const result = CopilotHookCommandSchema.safeParse(parsed);
            expect(result.success).toBe(true);
            expect(Object.keys(result.data?.env ?? {})).not.toContain(
                "__proto__",
            );
            // biome-ignore lint/style/useNamingConvention: VALID is a test env key in SCREAMING_SNAKE_CASE
            expect(result.data?.env).toEqual({ VALID: "ok" });
        });

        it("should preserve constructor as a valid env key (it is not a prototype-polluting key)", () => {
            // "constructor" matches the env-key regex and, unlike "__proto__", is a
            // normal own property when assigned — it does not modify the prototype chain.
            const parsed = JSON.parse(
                '{"type":"command","bash":"./check.sh","env":{"constructor":"value"}}',
            );
            const result = CopilotHookCommandSchema.safeParse(parsed);
            expect(result.success).toBe(true);
            expect(result.data?.env).toEqual({ constructor: "value" });
        });
    });

    describe("given a valid env key", () => {
        it("should accept alphanumeric env keys", () => {
            const result = CopilotHookCommandSchema.safeParse({
                type: "command",
                bash: "./check.sh",
                // biome-ignore lint/style/useNamingConvention: env keys use SCREAMING_SNAKE_CASE by convention
                env: { MY_VAR: "value", VAR2: "other" },
            });
            expect(result.success).toBe(true);
        });
    });
});

describe("CopilotHooksConfigSchema", () => {
    describe("given a preToolUse array exceeding the maximum length", () => {
        it("should reject arrays larger than MAX_HOOKS_PER_EVENT", () => {
            const entry = {
                type: "command",
                bash: "./check.sh",
                timeoutSec: 5,
            };
            const result = CopilotHooksConfigSchema.safeParse({
                version: 1,
                hooks: {
                    preToolUse: Array.from({ length: 101 }, () => entry),
                },
            });
            expect(result.success).toBe(false);
        });
    });

    describe("given arrays at the maximum length", () => {
        it("should accept arrays of exactly MAX_HOOKS_PER_EVENT entries", () => {
            const entry = {
                type: "command",
                bash: "./check.sh",
                timeoutSec: 5,
            };
            const result = CopilotHooksConfigSchema.safeParse({
                version: 1,
                hooks: {
                    preToolUse: Array.from({ length: 100 }, () => entry),
                },
            });
            expect(result.success).toBe(true);
        });
    });
});
