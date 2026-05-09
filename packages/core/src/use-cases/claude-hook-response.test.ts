import { describe, expect, it } from "vitest";
import {
    buildAdditionalContextResponse,
    buildPermissionDecisionResponse,
} from "./claude-hook-response.js";

describe("buildAdditionalContextResponse", () => {
    describe("when given a PreToolUse event with additionalContext", () => {
        it("should produce the correct hookSpecificOutput envelope", () => {
            const result = buildAdditionalContextResponse({
                hookEventName: "PreToolUse",
                additionalContext: "## Some Lesson\n\nBody text.",
            });

            const parsed = JSON.parse(result);
            expect(parsed).toEqual({
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    additionalContext: "## Some Lesson\n\nBody text.",
                },
            });
        });
    });

    describe("when given a SessionStart event with additionalContext", () => {
        it("should produce the correct hookSpecificOutput envelope", () => {
            const result = buildAdditionalContextResponse({
                hookEventName: "SessionStart",
                additionalContext: "## Invariant Lesson\n\nAlways do X.",
            });

            const parsed = JSON.parse(result);
            expect(parsed.hookSpecificOutput.hookEventName).toBe(
                "SessionStart",
            );
            expect(parsed.hookSpecificOutput.additionalContext).toBe(
                "## Invariant Lesson\n\nAlways do X.",
            );
        });
    });

    describe("when given an empty additionalContext", () => {
        it("should produce an envelope with empty string", () => {
            const result = buildAdditionalContextResponse({
                hookEventName: "PreToolUse",
                additionalContext: "",
            });

            const parsed = JSON.parse(result);
            expect(parsed.hookSpecificOutput.additionalContext).toBe("");
        });
    });
});

describe("buildPermissionDecisionResponse", () => {
    describe("when given an allow decision without reason", () => {
        it("should produce the correct envelope without permissionDecisionReason", () => {
            const result = buildPermissionDecisionResponse({
                hookEventName: "PreToolUse",
                permissionDecision: "allow",
            });

            const parsed = JSON.parse(result);
            expect(parsed).toEqual({
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "allow",
                },
            });
            expect(
                parsed.hookSpecificOutput.permissionDecisionReason,
            ).toBeUndefined();
        });
    });

    describe("when given a deny decision with a reason", () => {
        it("should include permissionDecisionReason in the envelope", () => {
            const result = buildPermissionDecisionResponse({
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: "Path is outside cwd",
            });

            const parsed = JSON.parse(result);
            expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
            expect(parsed.hookSpecificOutput.permissionDecisionReason).toBe(
                "Path is outside cwd",
            );
        });
    });
});
