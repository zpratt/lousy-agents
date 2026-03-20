// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import type { PolicyDeps } from "./policy.js";
import { evaluatePolicy, loadPolicy } from "./policy.js";
import type { TelemetryDeps } from "./telemetry.js";
import { emitPolicyDecisionEvent } from "./telemetry.js";
import type { PolicyConfig } from "./types.js";

export interface PolicyCheckDeps {
    readStdin: () => Promise<string>;
    writeStdout: (data: string) => void;
    writeStderr: (data: string) => void;
    env: Record<string, string | undefined>;
    policyDeps: PolicyDeps;
    telemetryDeps: TelemetryDeps;
}

const TERMINAL_TOOLS = new Set(["bash", "zsh", "ash", "sh"]);

function allowResponse(): string {
    return JSON.stringify({ permissionDecision: "allow" });
}

function denyResponse(reason: string): string {
    return JSON.stringify({
        permissionDecision: "deny",
        permissionDecisionReason: reason,
    });
}

export async function handlePolicyCheck(deps: PolicyCheckDeps): Promise<void> {
    try {
        const rawStdin = await deps.readStdin();

        let input: unknown;
        try {
            input = JSON.parse(rawStdin);
        } catch {
            deps.writeStderr("agent-shell: failed to parse stdin as JSON\n");
            deps.writeStdout(denyResponse("Invalid JSON input"));
            return;
        }

        if (
            typeof input !== "object" ||
            input === null ||
            !("toolName" in input)
        ) {
            deps.writeStdout(denyResponse("Missing or invalid toolName field"));
            return;
        }

        const { toolName } = input as Record<string, unknown>;

        if (typeof toolName !== "string") {
            deps.writeStdout(denyResponse("Missing or invalid toolName field"));
            return;
        }

        if (!TERMINAL_TOOLS.has(toolName)) {
            deps.writeStdout(allowResponse());
            return;
        }

        // Terminal tool — validate toolArgs
        const toolArgs = (input as Record<string, unknown>).toolArgs;

        if (typeof toolArgs !== "string") {
            deps.writeStdout(
                denyResponse(
                    "Missing or non-string toolArgs for terminal tool",
                ),
            );
            return;
        }

        let parsedArgs: unknown;
        try {
            parsedArgs = JSON.parse(toolArgs);
        } catch {
            deps.writeStderr("agent-shell: failed to parse toolArgs as JSON\n");
            deps.writeStdout(denyResponse("Invalid JSON in toolArgs"));
            return;
        }

        if (
            typeof parsedArgs !== "object" ||
            parsedArgs === null ||
            !("command" in parsedArgs)
        ) {
            deps.writeStdout(denyResponse("Missing command field in toolArgs"));
            return;
        }

        const { command } = parsedArgs as Record<string, unknown>;

        if (typeof command !== "string") {
            deps.writeStdout(
                denyResponse("Non-string command field in toolArgs"),
            );
            return;
        }

        // Load and evaluate policy
        let policy: PolicyConfig | null;
        try {
            policy = await loadPolicy(deps.env, deps.policyDeps);
        } catch (err) {
            deps.writeStderr(`agent-shell: policy load error: ${err}\n`);
            deps.writeStdout(denyResponse("Failed to load policy"));
            return;
        }

        const result = evaluatePolicy(policy, command);

        const responseJson =
            result.decision === "allow"
                ? allowResponse()
                : denyResponse(
                      `Command '${command}' denied by policy rule: ${result.matchedRule ?? "not in allow list"}`,
                  );

        // Emit telemetry (best-effort)
        const repoRoot = deps.policyDeps.getRepositoryRoot();
        try {
            await emitPolicyDecisionEvent(
                {
                    command: command.trim(),
                    decision: result.decision,
                    matched_rule: result.matchedRule,
                    env: deps.env,
                    projectRoot: repoRoot,
                },
                deps.telemetryDeps,
            );
        } catch (err) {
            deps.writeStderr(`agent-shell: telemetry write error: ${err}\n`);
        }

        deps.writeStdout(responseJson);
    } catch (err) {
        deps.writeStderr(`agent-shell: unexpected error: ${err}\n`);
        deps.writeStdout(
            denyResponse("Internal error during policy evaluation"),
        );
    }
}
