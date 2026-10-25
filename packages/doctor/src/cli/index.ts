import { defineCommand, runMain } from "citty";
import { createConsola } from "consola";
import { runDoctorCommand } from "./run-doctor-command.js";

const main = defineCommand({
    meta: {
        name: "agentic-doctor",
        version: "0.1.0",
        description:
            "Diagnose agentic configuration across harnesses: inventory, classify, elicit intent, and evaluate preconditions",
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
            description:
                "Force non-interactive mode (skip elicitation prompts, apply conservative inference)",
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

runMain(main);
