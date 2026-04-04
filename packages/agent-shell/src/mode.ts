export type Mode =
    | { type: "passthrough"; args: string[] }
    | { type: "policy-check" }
    | { type: "policy-init"; model?: string }
    | { type: "record" }
    | {
          type: "init";
          flightRecorder: boolean;
          policy: boolean;
          noFlightRecorder: boolean;
          noPolicy: boolean;
      }
    | { type: "version" }
    | { type: "shim"; command: string }
    | { type: "log" }
    | { type: "usage" };

const MODEL_PATTERN = /^[a-zA-Z0-9._-]+$/;

function parsePolicyInitOptions(args: string[]): { model?: string } {
    const options: { model?: string } = {};
    for (const arg of args.slice(2)) {
        if (arg.startsWith("--model=")) {
            const value = arg.slice("--model=".length);
            if (
                value.length > 0 &&
                value.length <= 128 &&
                MODEL_PATTERN.test(value)
            ) {
                options.model = value;
            }
        }
    }
    return options;
}

function parseInitOptions(args: string[]): {
    flightRecorder: boolean;
    policy: boolean;
    noFlightRecorder: boolean;
    noPolicy: boolean;
} {
    const options = {
        flightRecorder: false,
        policy: false,
        noFlightRecorder: false,
        noPolicy: false,
    };
    for (const arg of args.slice(1)) {
        switch (arg) {
            case "--flight-recorder":
                options.flightRecorder = true;
                break;
            case "--policy":
                options.policy = true;
                break;
            case "--no-flight-recorder":
                options.noFlightRecorder = true;
                break;
            case "--no-policy":
                options.noPolicy = true;
                break;
        }
    }
    return options;
}

export function resolveMode(
    args: string[],
    env: Record<string, string | undefined>,
): Mode {
    const firstArg = args[0];

    if (firstArg === "policy-check") return { type: "policy-check" };
    if (firstArg === "record") return { type: "record" };
    if (firstArg === "init") {
        const options = parseInitOptions(args);
        return { type: "init", ...options };
    }
    if (firstArg === "policy" && args[1] === "--init") {
        const options = parsePolicyInitOptions(args);
        return { type: "policy-init", model: options.model };
    }

    if (env.AGENTSHELL_PASSTHROUGH === "1") {
        return { type: "passthrough", args };
    }

    if (firstArg === "--version") return { type: "version" };
    if (firstArg === "-c" && args[1]) return { type: "shim", command: args[1] };
    if (firstArg === "log") return { type: "log" };
    return { type: "usage" };
}
