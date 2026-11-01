import { DOCTOR_ARGS } from "@lousy-agents/agentic-doctor";
import { describe, expect, it } from "vitest";
import { doctorCommand } from "./doctor.js";

describe("doctorCommand", () => {
    it("should take its flags from the shared DOCTOR_ARGS", () => {
        expect(doctorCommand.args).toBe(DOCTOR_ARGS);
    });
});
