// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import Chance from "chance";
import { describe, expect, it } from "vitest";
import {
    HooksConfigSchema,
    PolicyConfigSchema,
    PolicyDecisionEventSchema,
    SCHEMA_VERSION,
    ScriptEventSchema,
    ToolUseEventSchema,
} from "../src/entities/types.js";

const chance = new Chance();

function buildScriptEndEvent(overrides: Record<string, unknown> = {}) {
    return {
        v: 1 as const,
        session_id: chance.guid(),
        event: "script_end" as const,
        command: chance.word(),
        actor: chance.word(),
        exit_code: chance.integer({ min: 0, max: 255 }),
        signal: null,
        duration_ms: chance.floating({ min: 0, max: 60000, fixed: 2 }),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

function buildShimErrorEvent(overrides: Record<string, unknown> = {}) {
    return {
        v: 1 as const,
        session_id: chance.guid(),
        event: "shim_error" as const,
        command: chance.word(),
        actor: chance.word(),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

describe("ScriptEvent schema", () => {
    describe("schema version constant", () => {
        it("should equal 1", () => {
            expect(SCHEMA_VERSION).toBe(1);
        });
    });

    describe("given a valid script_end event", () => {
        it("should parse successfully", () => {
            // Arrange
            const event = buildScriptEndEvent();

            // Act
            const result = ScriptEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("script_end");
            expect(result.session_id).toBe(event.session_id);
        });

        it("should accept optional script, package, and package_version fields", () => {
            // Arrange
            const event = buildScriptEndEvent({
                script: chance.word(),
                package: chance.word(),
                package_version: chance.semver(),
            });

            // Act
            const result = ScriptEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("script_end");
        });
    });

    describe("given a valid shim_error event", () => {
        it("should parse successfully", () => {
            // Arrange
            const event = buildShimErrorEvent();

            // Act
            const result = ScriptEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("shim_error");
            expect(result.session_id).toBe(event.session_id);
        });
    });

    describe("given a script_end event missing exit_code", () => {
        it("should fail validation", () => {
            // Arrange
            const event = buildScriptEndEvent();
            const { exit_code: _, ...withoutExitCode } = event;

            // Act & Assert
            expect(() => ScriptEventSchema.parse(withoutExitCode)).toThrow();
        });
    });

    describe("given a shim_error event with an exit_code field", () => {
        it("should fail validation because shim_error does not include exit_code", () => {
            // Arrange
            const event = buildShimErrorEvent({
                exit_code: chance.integer({ min: 0, max: 255 }),
            });

            // Act & Assert
            expect(() => ScriptEventSchema.parse(event)).toThrow();
        });
    });

    describe("given an invalid event type", () => {
        it("should fail validation", () => {
            // Arrange
            const event = {
                v: 1,
                session_id: chance.guid(),
                event: "unknown_event",
                command: chance.word(),
                actor: chance.word(),
                timestamp: new Date().toISOString(),
                env: {},
                tags: {},
            };

            // Act & Assert
            expect(() => ScriptEventSchema.parse(event)).toThrow();
        });
    });

    describe("given a valid policy_decision event", () => {
        it("should parse successfully", () => {
            // Arrange
            const event = buildPolicyDecisionEvent();

            // Act
            const result = ScriptEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("policy_decision");
            expect(result.session_id).toBe(event.session_id);
        });
    });

    describe("given a policy_decision event with null matched_rule", () => {
        it("should parse with matched_rule as null", () => {
            // Arrange
            const event = buildPolicyDecisionEvent({ matched_rule: null });

            // Act
            const result = ScriptEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("policy_decision");
            expect(
                "matched_rule" in result ? result.matched_rule : undefined,
            ).toBeNull();
        });
    });
});

function buildPolicyDecisionEvent(overrides: Record<string, unknown> = {}) {
    return {
        v: SCHEMA_VERSION,
        session_id: chance.guid(),
        event: "policy_decision" as const,
        command: chance.word(),
        actor: chance.word(),
        decision: chance.pickone(["allow", "deny"]) as "allow" | "deny",
        matched_rule: chance.word(),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

describe("PolicyConfigSchema", () => {
    describe("given a valid policy with both allow and deny", () => {
        it("should parse successfully", () => {
            // Arrange
            const config = {
                allow: [chance.word(), chance.word()],
                deny: [chance.word()],
            };

            // Act
            const result = PolicyConfigSchema.parse(config);

            // Assert
            expect(result.allow).toEqual(config.allow);
            expect(result.deny).toEqual(config.deny);
        });
    });

    describe("given a policy with only deny rules", () => {
        it("should parse successfully with allow absent", () => {
            // Arrange
            const denyRules = [chance.word()];
            const config = { deny: denyRules };

            // Act
            const result = PolicyConfigSchema.parse(config);

            // Assert
            expect(result.allow).toBeUndefined();
            expect(result.deny).toEqual(denyRules);
        });
    });

    describe("given an empty object", () => {
        it("should default deny to empty array and leave allow undefined", () => {
            // Arrange
            const config = {};

            // Act
            const result = PolicyConfigSchema.parse(config);

            // Assert
            expect(result.allow).toBeUndefined();
            expect(result.deny).toEqual([]);
        });
    });

    describe("given deny is omitted", () => {
        it("should default deny to empty array", () => {
            // Arrange
            const allowRules = [chance.word()];
            const config = { allow: allowRules };

            // Act
            const result = PolicyConfigSchema.parse(config);

            // Assert
            expect(result.allow).toEqual(allowRules);
            expect(result.deny).toEqual([]);
        });
    });

    describe("given allow is an empty array", () => {
        it("should preserve the empty array (distinct from undefined)", () => {
            // Arrange
            const config = { allow: [], deny: [] };

            // Act
            const result = PolicyConfigSchema.parse(config);

            // Assert
            expect(result.allow).toEqual([]);
            expect(result.deny).toEqual([]);
        });
    });

    describe("given non-string array entries", () => {
        it("should reject the config", () => {
            // Arrange
            const config = { deny: [123, true] };

            // Act & Assert
            expect(() => PolicyConfigSchema.parse(config)).toThrow();
        });
    });

    describe("given allow is a non-array value", () => {
        it("should reject the config", () => {
            // Arrange
            const config = { allow: "not-an-array" };

            // Act & Assert
            expect(() => PolicyConfigSchema.parse(config)).toThrow();
        });
    });
});

describe("HooksConfigSchema", () => {
    describe("given a valid hooks config with a preToolUse command hook", () => {
        it("should parse successfully", () => {
            // Arrange
            const config = {
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command" as const,
                            bash: "./.github/hooks/agent-shell/policy-check.sh",
                            cwd: ".",
                            timeoutSec: 5,
                            env: {
                                AGENTSHELL_POLICY_PATH:
                                    ".github/hooks/agent-shell/policy.json",
                            },
                        },
                    ],
                },
            };

            // Act
            const result = HooksConfigSchema.parse(config);

            // Assert
            expect(result.version).toBe(1);
            expect(result.hooks.preToolUse).toHaveLength(1);
        });
    });

    describe("given a hooks config with no hook arrays", () => {
        it("should parse successfully with empty hooks object", () => {
            // Arrange
            const config = { version: 1, hooks: {} };

            // Act
            const result = HooksConfigSchema.parse(config);

            // Assert
            expect(result.version).toBe(1);
            expect(result.hooks.preToolUse).toBeUndefined();
        });
    });

    describe("given a hooks config with wrong version", () => {
        it("should reject the config", () => {
            // Arrange
            const config = { version: 2, hooks: {} };

            // Act & Assert
            expect(() => HooksConfigSchema.parse(config)).toThrow();
        });
    });

    describe("given a hook command with neither bash nor powershell", () => {
        it("should reject the config", () => {
            // Arrange
            const config = {
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command",
                            cwd: ".",
                            timeoutSec: 5,
                        },
                    ],
                },
            };

            // Act & Assert
            expect(() => HooksConfigSchema.parse(config)).toThrow();
        });
    });

    describe("given a hook command with only powershell", () => {
        it("should parse successfully", () => {
            // Arrange
            const config = {
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command" as const,
                            powershell: "./.github/hooks/policy-check.ps1",
                        },
                    ],
                },
            };

            // Act
            const result = HooksConfigSchema.parse(config);

            // Assert
            expect(result.hooks.preToolUse).toHaveLength(1);
        });
    });

    describe("given a hooks config with multiple hook lifecycle arrays", () => {
        it("should parse all lifecycle hooks", () => {
            // Arrange
            const hookEntry = {
                type: "command" as const,
                bash: chance.word(),
            };
            const config = {
                version: 1,
                hooks: {
                    sessionStart: [hookEntry],
                    preToolUse: [hookEntry],
                    postToolUse: [hookEntry],
                    sessionEnd: [hookEntry],
                },
            };

            // Act
            const result = HooksConfigSchema.parse(config);

            // Assert
            expect(result.hooks.sessionStart).toHaveLength(1);
            expect(result.hooks.preToolUse).toHaveLength(1);
            expect(result.hooks.postToolUse).toHaveLength(1);
            expect(result.hooks.sessionEnd).toHaveLength(1);
        });
    });
});

describe("PolicyDecisionEventSchema", () => {
    describe("given a valid policy_decision event with allow decision", () => {
        it("should parse successfully", () => {
            // Arrange
            const event = buildPolicyDecisionEvent({ decision: "allow" });

            // Act
            const result = PolicyDecisionEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("policy_decision");
            expect(result.decision).toBe("allow");
        });
    });

    describe("given a valid policy_decision event with deny decision", () => {
        it("should parse successfully", () => {
            // Arrange
            const matchedRule = chance.word();
            const event = buildPolicyDecisionEvent({
                decision: "deny",
                matched_rule: matchedRule,
            });

            // Act
            const result = PolicyDecisionEventSchema.parse(event);

            // Assert
            expect(result.decision).toBe("deny");
            expect(result.matched_rule).toBe(matchedRule);
        });
    });

    describe("given an event with invalid decision value", () => {
        it("should reject the event", () => {
            // Arrange
            const event = buildPolicyDecisionEvent({
                decision: "maybe",
            });

            // Act & Assert
            expect(() => PolicyDecisionEventSchema.parse(event)).toThrow();
        });
    });

    describe("given an event missing the decision field", () => {
        it("should reject the event", () => {
            // Arrange
            const event = buildPolicyDecisionEvent();
            const { decision: _, ...withoutDecision } = event;

            // Act & Assert
            expect(() =>
                PolicyDecisionEventSchema.parse(withoutDecision),
            ).toThrow();
        });
    });

    describe("given an event with null matched_rule", () => {
        it("should parse successfully", () => {
            // Arrange
            const event = buildPolicyDecisionEvent({ matched_rule: null });

            // Act
            const result = PolicyDecisionEventSchema.parse(event);

            // Assert
            expect(result.matched_rule).toBeNull();
        });
    });
});

describe("PolicyConfigSchema strict mode", () => {
    describe("given a config with a typo in a field name", () => {
        it("should reject unrecognized keys to prevent silent policy bypass", () => {
            // Arrange — "alow" is a typo for "allow"
            const config = { alow: ["npm test"], deny: [] };

            // Act & Assert
            expect(() => PolicyConfigSchema.parse(config)).toThrow();
        });
    });

    describe("given null input", () => {
        it("should reject non-object input", () => {
            // Act & Assert
            expect(() => PolicyConfigSchema.parse(null)).toThrow();
        });
    });

    describe("given a string input", () => {
        it("should reject non-object input", () => {
            // Act & Assert
            expect(() => PolicyConfigSchema.parse("not-an-object")).toThrow();
        });
    });

    describe("given a rule exceeding max length", () => {
        it("should reject overly long rule strings", () => {
            // Arrange
            const longRule = "a".repeat(1025);
            const config = { deny: [longRule] };

            // Act & Assert
            expect(() => PolicyConfigSchema.parse(config)).toThrow();
        });
    });
});

describe("HooksConfigSchema strict mode", () => {
    describe("given a typo in a lifecycle hook name", () => {
        it("should reject unrecognized hook names to prevent silent omission", () => {
            // Arrange — "preTooluse" is a typo for "preToolUse"
            const hookEntry = {
                type: "command" as const,
                bash: "./policy-check.sh",
            };
            const config = {
                version: 1,
                hooks: { preTooluse: [hookEntry] },
            };

            // Act & Assert
            expect(() => HooksConfigSchema.parse(config)).toThrow();
        });
    });

    describe("given a config missing the hooks field", () => {
        it("should reject the config", () => {
            // Arrange
            const config = { version: 1 };

            // Act & Assert
            expect(() => HooksConfigSchema.parse(config)).toThrow();
        });
    });

    describe("given a config missing the version field", () => {
        it("should reject the config", () => {
            // Arrange
            const config = { hooks: {} };

            // Act & Assert
            expect(() => HooksConfigSchema.parse(config)).toThrow();
        });
    });

    describe("given a hook command with timeoutSec of zero", () => {
        it("should reject non-positive timeout", () => {
            // Arrange
            const config = {
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command" as const,
                            bash: "./check.sh",
                            timeoutSec: 0,
                        },
                    ],
                },
            };

            // Act & Assert
            expect(() => HooksConfigSchema.parse(config)).toThrow();
        });
    });

    describe("given a hook command with negative timeoutSec", () => {
        it("should reject negative timeout", () => {
            // Arrange
            const config = {
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command" as const,
                            bash: "./check.sh",
                            timeoutSec: -1,
                        },
                    ],
                },
            };

            // Act & Assert
            expect(() => HooksConfigSchema.parse(config)).toThrow();
        });
    });
});

describe("PolicyDecisionEventSchema strict mode", () => {
    describe("given an event with extra unknown properties", () => {
        it("should reject unrecognized fields", () => {
            // Arrange
            const event = {
                ...buildPolicyDecisionEvent(),
                extra_field: chance.word(),
            };

            // Act & Assert
            expect(() => PolicyDecisionEventSchema.parse(event)).toThrow();
        });
    });
});

function buildToolUseEvent(overrides: Record<string, unknown> = {}) {
    return {
        v: SCHEMA_VERSION,
        session_id: chance.guid(),
        event: "tool_use" as const,
        tool_name: chance.pickone(["bash", "npm", "curl", "file_edit"]),
        command: chance.word(),
        actor: chance.word(),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

describe("ToolUseEventSchema", () => {
    describe("given a valid tool_use event", () => {
        it("should parse successfully", () => {
            // Arrange
            const event = buildToolUseEvent();

            // Act
            const result = ToolUseEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("tool_use");
            expect(result.tool_name).toBe(event.tool_name);
            expect(result.command).toBe(event.command);
        });
    });

    describe("given a tool_use event with empty command", () => {
        it("should parse successfully for non-terminal tools", () => {
            // Arrange
            const event = buildToolUseEvent({
                tool_name: "file_edit",
                command: "",
            });

            // Act
            const result = ToolUseEventSchema.parse(event);

            // Assert
            expect(result.command).toBe("");
        });
    });

    describe("given a tool_use event missing tool_name", () => {
        it("should reject the event", () => {
            // Arrange
            const event = buildToolUseEvent();
            const { tool_name: _, ...withoutToolName } = event;

            // Act & Assert
            expect(() => ToolUseEventSchema.parse(withoutToolName)).toThrow();
        });
    });

    describe("given a tool_use event with extra unknown properties", () => {
        it("should reject unrecognized fields", () => {
            // Arrange
            const event = {
                ...buildToolUseEvent(),
                extra_field: chance.word(),
            };

            // Act & Assert
            expect(() => ToolUseEventSchema.parse(event)).toThrow();
        });
    });

    describe("given a tool_use event parsed through the discriminated union", () => {
        it("should parse successfully via ScriptEventSchema", () => {
            // Arrange
            const event = buildToolUseEvent();

            // Act
            const result = ScriptEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("tool_use");
        });
    });
});
