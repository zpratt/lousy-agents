import {
    DOCTOR_ARGS,
    processDoctorEnvironment,
    runDoctorCommand,
} from "@lousy-agents/agentic-doctor";
import { defineCommand } from "citty";

export const doctorCommand = defineCommand({
    meta: {
        name: "doctor",
        description:
            "Diagnose agentic configuration across harnesses: inventory, classify, and evaluate preconditions",
    },
    args: DOCTOR_ARGS,
    async run({ args }) {
        process.exitCode = await runDoctorCommand(
            args,
            processDoctorEnvironment(),
        );
    },
});
