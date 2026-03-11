// Best-effort agent detection env vars (Phase 1):
// - CLAUDE_CODE: Set by Claude Code (`CLAUDE_CODE=1`) in its shell sessions
// - COPILOT_AGENT: Set by GitHub Copilot coding agent in its shell sessions
// If these prove incorrect, the detection rule should be removed entirely.

/**
 * Determines who initiated a script execution based on environment variables.
 *
 * Detection priority (first match wins):
 * 1. Explicit override via AGENTSHELL_ACTOR
 * 2. CI detection via GITHUB_ACTIONS
 * 3. Known coding agent detection (Claude Code, GitHub Copilot)
 * 4. Fallback to "human"
 */
export function detectActor(env: Record<string, string | undefined>): string {
    const override = env.AGENTSHELL_ACTOR;
    if (override !== undefined && override !== "") {
        return override;
    }

    if (env.GITHUB_ACTIONS === "true") {
        return "ci";
    }

    if (env.CLAUDE_CODE !== undefined && env.CLAUDE_CODE !== "") {
        return "claude-code";
    }

    if (env.COPILOT_AGENT !== undefined && env.COPILOT_AGENT !== "") {
        return "copilot";
    }

    return "human";
}
