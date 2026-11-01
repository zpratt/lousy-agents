import { describe, expect, it } from "vitest";
import { DOCTOR_ARGS } from "./doctor-args.js";

describe("DOCTOR_ARGS", () => {
    it("should define exactly the summary, format, and ci flags", () => {
        expect(Object.keys(DOCTOR_ARGS).sort()).toEqual([
            "ci",
            "format",
            "summary",
        ]);
    });

    it("should default to a full, human, interactive-capable run", () => {
        expect(DOCTOR_ARGS.summary).toMatchObject({
            type: "boolean",
            default: false,
        });
        expect(DOCTOR_ARGS.format).toMatchObject({
            type: "string",
            default: "human",
        });
        expect(DOCTOR_ARGS.ci).toMatchObject({
            type: "boolean",
            default: false,
        });
    });

    it("should describe every flag", () => {
        expect(DOCTOR_ARGS.summary.description).toBe(
            "Show archetype classification only — skip evaluation",
        );
        expect(DOCTOR_ARGS.format.description).toBe(
            "Output format: human (default) or json",
        );
        expect(DOCTOR_ARGS.ci.description).toBe(
            "Force non-interactive mode (skip intent elicitation prompts)",
        );
    });
});
