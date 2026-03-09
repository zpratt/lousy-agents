export type Mode =
    | { type: "passthrough"; args: string[] }
    | { type: "version" }
    | { type: "shim"; command: string }
    | { type: "log" }
    | { type: "usage" };

export function resolveMode(
    args: string[],
    env: Record<string, string | undefined>,
): Mode {
    if (env.AGENTSHELL_PASSTHROUGH === "1") {
        return { type: "passthrough", args };
    }

    const firstArg = args[0];

    if (firstArg === "--version") return { type: "version" };
    if (firstArg === "-c" && args[1]) return { type: "shim", command: args[1] };
    if (firstArg === "log") return { type: "log" };
    return { type: "usage" };
}
