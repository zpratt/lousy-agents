/**
 * Shared human-readable labels for lint target categories, used by both
 * per-file diagnostic display and the pass/fail summary line.
 */

const TARGET_LABELS: Record<string, string> = {
    skill: "skill(s)",
    agent: "agent(s)",
    subagent: "subagent(s)",
    hook: "hook config(s)",
    instruction: "instruction file(s)",
    "mcp-server": "MCP server config(s)",
};

export function targetLabel(target: string): string {
    return TARGET_LABELS[target] ?? target;
}
