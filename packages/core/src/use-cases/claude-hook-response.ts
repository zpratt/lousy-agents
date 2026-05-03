export type ClaudeHookEventName =
    | "PreToolUse"
    | "PostToolUse"
    | "UserPromptSubmit"
    | "SessionStart"
    | "SubagentStart"
    | "Stop"
    | "SubagentStop";

export interface AdditionalContextPayload {
    readonly hookEventName: ClaudeHookEventName;
    readonly additionalContext: string;
}

export interface PermissionDecisionPayload {
    readonly hookEventName: "PreToolUse";
    readonly permissionDecision: "allow" | "deny" | "ask";
    readonly permissionDecisionReason?: string;
}

export function buildAdditionalContextResponse(
    payload: AdditionalContextPayload,
): string {
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: payload.hookEventName,
            additionalContext: payload.additionalContext,
        },
    });
}

export function buildPermissionDecisionResponse(
    payload: PermissionDecisionPayload,
): string {
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: payload.hookEventName,
            permissionDecision: payload.permissionDecision,
            ...(payload.permissionDecisionReason !== undefined
                ? {
                      permissionDecisionReason:
                          payload.permissionDecisionReason,
                  }
                : {}),
        },
    });
}
