import type { ArgsDef } from "citty";

export const DOCTOR_ARGS = {
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
            "Force non-interactive mode (skip intent elicitation prompts)",
        default: false,
    },
} as const satisfies ArgsDef;
