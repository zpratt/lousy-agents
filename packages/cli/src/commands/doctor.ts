import { runDoctorCommand } from "@lousy-agents/agentic-doctor";
import { defineCommand } from "citty";
import { createConsola } from "consola";

export const doctorCommand = defineCommand({
    meta: {
        name: "doctor",
        description:
            "Diagnose agentic configuration across harnesses: inventory, classify, and evaluate preconditions",
    },
    args: {
        summary: {
            type: "boolean",
            description: "Show archetype classification only — skip evaluation",
            default: false,
        },
        format: {
            type: "string",
            description: "Output format: human (default) or json",
            default: "human",
        },
        ci: {
            type: "boolean",
            description: "Force non-interactive mode",
            default: false,
        },
    },
    async run({ args }) {
        process.exitCode = await runDoctorCommand(args, {
            cwd: process.cwd(),
            stdinIsTty: process.stdin.isTTY === true,
            logger: createConsola(),
            writeStdout: (text) => process.stdout.write(text),
        });
    },
});
