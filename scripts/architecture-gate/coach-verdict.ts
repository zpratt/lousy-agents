import {
    type CoachReport,
    type CoachSignal,
    type LayerMembership,
    parseCoachReport,
} from "./coach-report.js";
import { GateError } from "./gate-error.js";

const LAYER_VIOLATION_RULE = "architecture.layer_violation";

/** What running coach produced; `exitCode` is null when a signal ended it. */
export interface CoachRun {
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

export interface GateVerdict {
    readonly passed: boolean;
    readonly messages: readonly string[];
}

function failed(...messages: string[]): GateVerdict {
    return { passed: false, messages };
}

function describeViolation(signal: CoachSignal): string {
    if (signal.importer !== undefined && signal.importee !== undefined) {
        const pair = signal.forbiddenPair ?? "forbidden import";
        return `  ${signal.importer} -> ${signal.importee} (${pair})`;
    }
    return `  ${signal.path} (the report names no import)`;
}

function violationMessages(signals: readonly CoachSignal[]): string[] {
    const violations = signals.filter(
        (signal) => signal.ruleId === LAYER_VIOLATION_RULE,
    );
    if (violations.length === 0) {
        return [];
    }
    return [
        `coach reported ${violations.length} ${LAYER_VIOLATION_RULE} signal(s):`,
        ...violations.map(describeViolation),
    ];
}

/**
 * Coach checks forbidden imports only between files a layer claims, so a file
 * outside every layer is a hole in the check rather than a pass.
 */
function membershipMessages(membership: LayerMembership): string[] {
    const { analyzedFiles, filesOutsideLayers } = membership;
    if (filesOutsideLayers === 0) {
        return [];
    }
    return [
        `${filesOutsideLayers} of ${analyzedFiles} files coach analyzed sit outside every declared layer, so imports to or from them are not checked: add each to a layer in the policy (\`mise run coach-baseline\` prints the count)`,
    ];
}

function verdictForReport(report: CoachReport): GateVerdict {
    const messages = [
        ...violationMessages(report.signals),
        ...membershipMessages(report.layerMembership),
    ];
    return { passed: messages.length === 0, messages };
}

/** Coach's exit status when `--fail-on-incomplete-coverage` finds a gap. */
const INCOMPLETE_COVERAGE_EXIT_CODE = 3;

function describeExit(exitCode: number | null): string {
    if (exitCode === null) {
        return "coach did not exit normally (it was ended by a signal)";
    }
    return exitCode === INCOMPLETE_COVERAGE_EXIT_CODE
        ? `coach reported incomplete coverage (exit ${exitCode}): its report lists the coverage diagnostics, and \`mise run coach-baseline\` prints them`
        : `coach failed with exit code ${exitCode}`;
}

/** Words a run that did not exit 0, with whatever coach said on stderr. */
export function incompleteRunMessages(run: CoachRun): string[] {
    const detail = run.stderr.trim();
    return [describeExit(run.exitCode), ...(detail === "" ? [] : [detail])];
}

/**
 * Decides whether the architecture gate passes. It passes only when coach
 * exited 0 with a readable report that has no layer violation at any
 * lifecycle and no analyzed file outside every declared layer. Every other outcome fails, so a broken or unreadable run can
 * never look like a clean one.
 */
export function evaluateCoachRun(run: CoachRun): GateVerdict {
    if (run.exitCode !== 0) {
        return failed(...incompleteRunMessages(run));
    }
    try {
        return verdictForReport(parseCoachReport(run.stdout));
    } catch (error) {
        if (error instanceof GateError) {
            return failed(error.message);
        }
        throw error;
    }
}
