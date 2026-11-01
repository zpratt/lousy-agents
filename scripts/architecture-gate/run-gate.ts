import {
    type CoachRun,
    evaluateCoachRun,
    type GateVerdict,
} from "./coach-verdict.js";

/** Repository-relative path of the layering policy coach enforces. */
export const POLICY_PATH = "project.json";

/**
 * Scans every tracked TypeScript file at HEAD against the committed policy.
 * `--fail-on-incomplete-coverage` makes coach exit 3 rather than report on a
 * partial analysis, and `--no-interactive` keeps it from waiting for input.
 */
export const COACH_ARGUMENTS: readonly string[] = [
    "codesignal",
    "--baseline",
    "--project-config",
    POLICY_PATH,
    "--project-language",
    "typescript",
    "--no-interactive",
    "--fail-on-incomplete-coverage",
    "--format",
    "json",
];

/** Runs coach with the given arguments; throws when it cannot be started. */
export type RunCoach = (args: readonly string[]) => Promise<CoachRun>;

export async function runArchitectureGate(
    runCoach: RunCoach,
): Promise<GateVerdict> {
    return evaluateCoachRun(await runCoach(COACH_ARGUMENTS));
}
