/**
 * GitHub Actions workflow commands for diagnostics that must reach the run
 * even when reviewdog's diff filter drops them.
 */

import type { LintDiagnostic } from "@lousy-agents/lint";

const COMMAND_BY_SEVERITY = {
    error: "error",
    warning: "warning",
    info: "notice",
} as const;

/** Escapes command data the way the Actions runner reads it. */
function escapeData(value: string): string {
    return value
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A");
}

/** Escapes a command property value, which also may not contain `:` or `,`. */
function escapeProperty(value: string): string {
    return escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

/**
 * Formats a diagnostic as a workflow command, for example
 * `::warning title=instruction/discovery-limit-reached::message`. The runner
 * turns it into an annotation on the run, not on a file.
 */
export function formatWorkflowCommand(
    diagnostic: Pick<LintDiagnostic, "severity" | "ruleId" | "message">,
): string {
    const command = COMMAND_BY_SEVERITY[diagnostic.severity];
    const title =
        diagnostic.ruleId === undefined
            ? ""
            : ` title=${escapeProperty(diagnostic.ruleId)}`;
    return `::${command}${title}::${escapeData(diagnostic.message)}`;
}
