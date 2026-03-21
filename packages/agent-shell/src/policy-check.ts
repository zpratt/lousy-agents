// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import { z } from "zod/v4";
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

const HookInputSchema = z.object({
    toolName: z.string(),
    toolArgs: z.unknown().optional(),
});

function allowResponse(): string {
    return JSON.stringify({ permissionDecision: "allow" });
}

function denyResponse(reason: string): string {
    return JSON.stringify({
        permissionDecision: "deny",
        permissionDecisionReason: reason,
    });
}

const TELEMETRY_TIMEOUT_MS = 5_000;

async function tryEmitTelemetry(
    deps: PolicyCheckDeps,
    command: string,
    decision: "allow" | "deny",
    matchedRule: string | null,
): Promise<void> {
    try {
        const repoRoot = deps.policyDeps.getRepositoryRoot();
        const emission = emitPolicyDecisionEvent(
            {
                command,
                decision,
                matched_rule: matchedRule,
                env: deps.env,
                projectRoot: repoRoot,
            },
            deps.telemetryDeps,
        );
        // Prevent unhandled rejection if emission rejects after timeout wins the race
        emission.catch(() => {});
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<void>((_, reject) => {
            timeoutHandle = setTimeout(
                () => reject(new Error("telemetry write timed out")),
                TELEMETRY_TIMEOUT_MS,
            );
            timeoutHandle.unref();
        });
        try {
            await Promise.race([emission, timeout]);
        } finally {
            if (timeoutHandle !== undefined) {
                clearTimeout(timeoutHandle);
            }
        }
    } catch (err) {
        deps.writeStderr(`agent-shell: telemetry write error: ${err}\n`);
    }
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

        const hookResult = HookInputSchema.safeParse(input);

        if (!hookResult.success) {
            deps.writeStdout(denyResponse("Missing or invalid toolName field"));
            return;
        }

        const { toolName, toolArgs } = hookResult.data;

        // Step 3 (per spec): load and validate policy before terminal tool check
        // (fail-closed on invalid policy, even for non-terminal tools)
        let policy: PolicyConfig | null;
        try {
            policy = await loadPolicy(deps.env, deps.policyDeps);
        } catch (err) {
            deps.writeStderr(`agent-shell: policy load error: ${err}\n`);
            deps.writeStdout(denyResponse("Failed to load policy"));
            return;
        }

        // Step 4 (per spec): non-terminal tools pass through with allow.
        // Per spec: command field is empty string for non-terminal tool decisions
        // (toolArgs is never parsed, so no command string is available).
        if (!TERMINAL_TOOLS.has(toolName)) {
            deps.writeStdout(allowResponse());
            await tryEmitTelemetry(deps, "", "allow", null);
            return;
        }

        // Terminal tool — validate toolArgs
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

        // toolArgs must be a non-null plain object
        if (
            parsedArgs === null ||
            typeof parsedArgs !== "object" ||
            Array.isArray(parsedArgs)
        ) {
            deps.writeStdout(
                denyResponse(
                    "toolArgs must be a non-null plain object for terminal tools",
                ),
            );
            return;
        }

        const obj = parsedArgs as Record<string, unknown>;

        if (!("command" in obj)) {
            deps.writeStdout(denyResponse("Missing command field in toolArgs"));
            return;
        }

        if (typeof obj.command !== "string") {
            deps.writeStdout(denyResponse("command field must be a string"));
            return;
        }

        const command = obj.command;

        const result = evaluatePolicy(policy, command);

        const responseJson =
            result.decision === "allow"
                ? allowResponse()
                : denyResponse(
                      `Command '${command}' denied by policy rule: ${result.matchedRule ?? "not in allow list"}`,
                  );

        deps.writeStdout(responseJson);

        await tryEmitTelemetry(
            deps,
            command.trim(),
            result.decision,
            result.matchedRule,
        );
    } catch (err) {
        deps.writeStderr(`agent-shell: unexpected error: ${err}\n`);
        deps.writeStdout(
            denyResponse("Internal error during policy evaluation"),
        );
    }
}
