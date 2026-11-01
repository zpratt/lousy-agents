import {
    type CoachRun,
    evaluateCoachRun,
    type GateVerdict,
    incompleteRunMessages,
} from "./coach-verdict.js";
import { POLICY_PATH } from "./policy-path.js";

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

/**
 * The coach release this gate is written for, the one `mise.toml` pins. A
 * different release may count imports differently, and a bare
 * `npm run lint:architecture` runs whichever coach is on `PATH`, so the gate
 * checks before it trusts a scan.
 */
export const REQUIRED_COACH_VERSION = "0.11.0";

/** Coach reads `--version` only as its first argument; it has no JSON form. */
export const COACH_VERSION_ARGUMENTS: readonly string[] = ["--version"];

/**
 * Why the version coach printed is not the required one, or null when it is.
 * It must be exactly the pinned release: `dev` (a build that is not a
 * release), a prefix, a second line or no output at all all fail.
 */
function describeVersionMismatch(run: CoachRun): string | null {
    if (run.exitCode !== 0) {
        return incompleteRunMessages(run).join("\n");
    }
    const printed = run.stdout.trim();
    return printed === REQUIRED_COACH_VERSION
        ? null
        : `the gate is written for coach ${REQUIRED_COACH_VERSION}, but \`coach --version\` printed ${JSON.stringify(printed)}; run it through mise, which pins ${REQUIRED_COACH_VERSION}`;
}

/**
 * Passes only when coach is the required release and exits 0 with a readable
 * report that has no layer violation. The version is checked first, in a
 * separate run, because the report does not carry it.
 */
export async function runArchitectureGate(
    runCoach: RunCoach,
): Promise<GateVerdict> {
    const mismatch = describeVersionMismatch(
        await runCoach(COACH_VERSION_ARGUMENTS),
    );
    if (mismatch !== null) {
        return { passed: false, messages: [mismatch] };
    }
    return evaluateCoachRun(await runCoach(COACH_ARGUMENTS));
}
