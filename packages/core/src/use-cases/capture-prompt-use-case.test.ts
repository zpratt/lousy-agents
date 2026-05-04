import { describe, expect, it } from "vitest";
import {
    buildCapturePrompt,
    STOP_CAPTURE_TEMPLATE,
    SUBAGENT_STOP_CAPTURE_TEMPLATE,
} from "./capture-prompt-use-case.js";

describe("buildCapturePrompt", () => {
    describe("given a Stop hook event", () => {
        it("returns the Stop capture template", () => {
            const result = buildCapturePrompt({ hookEventName: "Stop" });

            expect(result.prompt).toBe(STOP_CAPTURE_TEMPLATE);
        });

        it("does not include 'subagent' references in the template", () => {
            const result = buildCapturePrompt({ hookEventName: "Stop" });

            expect(result.prompt).not.toContain("subagent");
        });
    });

    describe("given a SubagentStop hook event", () => {
        it("returns the SubagentStop capture template", () => {
            const result = buildCapturePrompt({
                hookEventName: "SubagentStop",
            });

            expect(result.prompt).toBe(SUBAGENT_STOP_CAPTURE_TEMPLATE);
        });

        it("includes 'subagent' references in the template", () => {
            const result = buildCapturePrompt({
                hookEventName: "SubagentStop",
            });

            expect(result.prompt).toContain("subagent");
        });
    });

    describe("given either event type", () => {
        it("instructs the agent to check existing lessons before creating new ones", () => {
            for (const event of ["Stop", "SubagentStop"] as const) {
                const result = buildCapturePrompt({ hookEventName: event });
                expect(result.prompt).toContain("List existing lessons");
            }
        });

        it("references the lessons directory path", () => {
            for (const event of ["Stop", "SubagentStop"] as const) {
                const result = buildCapturePrompt({ hookEventName: event });
                expect(result.prompt).toContain(".lousy-agents/lessons/");
            }
        });
    });
});
