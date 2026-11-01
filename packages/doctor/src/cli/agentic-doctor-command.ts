import { defineCommand } from "citty";
import { DOCTOR_ARGS } from "./doctor-args.js";
import { processDoctorEnvironment } from "./process-environment.js";
import { runDoctorCommand } from "./run-doctor-command.js";

export const agenticDoctorCommand = defineCommand({
    meta: {
        name: "agentic-doctor",
        version: "0.1.0",
        description:
            "Diagnose agentic configuration across harnesses: inventory, classify, elicit intent, and evaluate preconditions",
    },
    args: DOCTOR_ARGS,
    async run({ args }) {
        process.exitCode = await runDoctorCommand(
            args,
            processDoctorEnvironment(),
        );
    },
});
