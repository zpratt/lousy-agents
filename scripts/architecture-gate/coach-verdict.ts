import { type CoachSignal, parseCoachReport } from "./coach-report.js";
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

function verdictForSignals(signals: readonly CoachSignal[]): GateVerdict {
    const violations = signals.filter(
        (signal) => signal.ruleId === LAYER_VIOLATION_RULE,
    );
    if (violations.length === 0) {
        return { passed: true, messages: [] };
    }
    return failed(
        `coach reported ${violations.length} ${LAYER_VIOLATION_RULE} signal(s):`,
        ...violations.map(describeViolation),
    );
}

function incompleteRunMessages(run: CoachRun): string[] {
    const detail = run.stderr.trim();
    return [
        run.exitCode === null
            ? "coach did not exit normally (it was ended by a signal)"
            : `coach failed with exit code ${run.exitCode}`,
        ...(detail === "" ? [] : [detail]),
    ];
}

/**
 * Decides whether the architecture gate passes. It passes only when coach
 * exited 0 with a readable report that has no layer violation at any
 * lifecycle. Every other outcome fails, so a broken or unreadable run can
 * never look like a clean one.
 */
export function evaluateCoachRun(run: CoachRun): GateVerdict {
    if (run.exitCode !== 0) {
        return failed(...incompleteRunMessages(run));
    }
    try {
        return verdictForSignals(parseCoachReport(run.stdout).signals);
    } catch (error) {
        if (error instanceof GateError) {
            return failed(error.message);
        }
        throw error;
    }
}
