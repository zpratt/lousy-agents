// biome-ignore-all lint/style/useNamingConvention: Claude hook API uses snake_case field names
import Chance from "chance";
import { describe, expect, it } from "vitest";
import {
    ClaudePreToolUseHookInputSchema,
    ClaudeSessionStartHookInputSchema,
    ClaudeStopHookInputSchema,
    ClaudeSubagentStopHookInputSchema,
} from "./claude-hook-input-schema.js";

const chance = new Chance();

describe("ClaudePreToolUseHookInputSchema", () => {
    describe("given a valid PreToolUse payload", () => {
        it("parses successfully", () => {
            const payload = {
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Bash",
                tool_input: { command: "ls -la" },
            };

            expect(
                ClaudePreToolUseHookInputSchema.safeParse(payload).success,
            ).toBe(true);
        });
    });

    describe("given a payload with the wrong hook_event_name", () => {
        it("fails to parse", () => {
            const payload = {
                hook_event_name: "SessionStart",
                session_id: chance.guid(),
                tool_name: "Bash",
                tool_input: {},
            };

            expect(
                ClaudePreToolUseHookInputSchema.safeParse(payload).success,
            ).toBe(false);
        });
    });

    describe("given a payload with extra fields", () => {
        it("parses successfully (strips unknown fields; forward-compatible with new Claude API fields)", () => {
            const payload = {
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Bash",
                tool_input: {},
                extra_field: "should-be-accepted",
            };

            expect(
                ClaudePreToolUseHookInputSchema.safeParse(payload).success,
            ).toBe(true);
        });
    });

    describe("given a PreToolUse payload with a file_path in tool_input", () => {
        it("exposes file_path as a typed optional string", () => {
            const payload = {
                hook_event_name: "PreToolUse",
                session_id: chance.guid(),
                tool_name: "Edit",
                tool_input: {
                    file_path: "src/foo.ts",
                    old_string: "before",
                    new_string: "after",
                },
            };

            const result = ClaudePreToolUseHookInputSchema.safeParse(payload);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.tool_input.file_path).toBe("src/foo.ts");
            }
        });
    });
});

describe("ClaudeSessionStartHookInputSchema", () => {
    describe("given a valid SessionStart payload", () => {
        it("parses successfully", () => {
            const payload = {
                hook_event_name: "SessionStart",
                session_id: chance.guid(),
            };

            expect(
                ClaudeSessionStartHookInputSchema.safeParse(payload).success,
            ).toBe(true);
        });
    });

    describe("given a payload missing session_id", () => {
        it("fails to parse", () => {
            const payload = { hook_event_name: "SessionStart" };

            expect(
                ClaudeSessionStartHookInputSchema.safeParse(payload).success,
            ).toBe(false);
        });
    });
});

describe("ClaudeStopHookInputSchema", () => {
    describe("given a valid Stop payload without transcript", () => {
        it("parses successfully", () => {
            const payload = {
                hook_event_name: "Stop",
                session_id: chance.guid(),
            };

            expect(ClaudeStopHookInputSchema.safeParse(payload).success).toBe(
                true,
            );
        });
    });

    describe("given a valid Stop payload with transcript", () => {
        it("parses successfully", () => {
            const payload = {
                hook_event_name: "Stop",
                session_id: chance.guid(),
                transcript: [{ role: "user", content: "hello" }],
            };

            expect(ClaudeStopHookInputSchema.safeParse(payload).success).toBe(
                true,
            );
        });
    });
});

describe("ClaudeSubagentStopHookInputSchema", () => {
    describe("given a valid SubagentStop payload", () => {
        it("parses successfully", () => {
            const payload = {
                hook_event_name: "SubagentStop",
                session_id: chance.guid(),
            };

            expect(
                ClaudeSubagentStopHookInputSchema.safeParse(payload).success,
            ).toBe(true);
        });
    });
});
