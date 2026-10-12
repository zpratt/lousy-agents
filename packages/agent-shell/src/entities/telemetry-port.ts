// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names

/**
 * I/O the telemetry gateway needs to resolve and append to event logs.
 */
export interface TelemetryDeps {
    mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
    appendFile: (path: string, data: string) => Promise<void>;
    realpath: (path: string) => Promise<string>;
    cwd: () => string;
    randomUUID: () => string;
    writeStderr: (msg: string) => void;
    now: () => string;
}

export interface PolicyDecisionEventOptions {
    command: string;
    decision: "allow" | "deny";
    matched_rule: string | null;
    env: Record<string, string | undefined>;
    projectRoot: string;
}

export interface ToolUseEventOptions {
    tool_name: string;
    command: string;
    env: Record<string, string | undefined>;
    projectRoot: string;
}

export type EmitPolicyDecisionEvent = (
    options: PolicyDecisionEventOptions,
    deps: TelemetryDeps,
) => Promise<void>;

export type EmitToolUseEvent = (
    options: ToolUseEventOptions,
    deps: TelemetryDeps,
) => Promise<void>;
