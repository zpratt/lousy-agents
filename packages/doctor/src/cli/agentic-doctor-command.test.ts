import { describe, expect, it } from "vitest";
import { agenticDoctorCommand } from "./agentic-doctor-command.js";
import { DOCTOR_ARGS } from "./doctor-args.js";

describe("agenticDoctorCommand", () => {
    it("should take its flags from the shared DOCTOR_ARGS", () => {
        expect(agenticDoctorCommand.args).toBe(DOCTOR_ARGS);
    });
});
