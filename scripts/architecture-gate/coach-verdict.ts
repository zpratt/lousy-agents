import {
    type CoachDiagnostic,
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
        `${filesOutsideLayers} of ${analyzedFiles} files coach analyzed sit outside every declared layer, so imports to or from them are not checked. Coach does not name them: \`npx vitest run scripts/architecture-gate/project-policy.test.ts\` lists unmapped files under packages/*/src, and a new file outside it that a tsconfig.json includes needs a layer too`,
    ];
}

const NON_LITERAL_IMPORT = "project_import_non_literal";

interface KnownDynamicImport {
    readonly path: string;
    readonly expression: string;
}

/**
 * Dynamic loads whose target layer rules cannot see, accepted one by one after
 * review. agent-shell imports the project's own copy of the Copilot SDK from a
 * path it resolves at run time, so that specifier cannot be a literal.
 */
const KNOWN_DYNAMIC_IMPORTS: readonly KnownDynamicImport[] = [
    {
        path: "packages/agent-shell/src/gateways/copilot-sdk-loader.ts",
        expression: "sdkPath",
    },
];

const SPECIFIER_EXPRESSION = /non-literal specifier \("((?:[^"\\]|\\.)*)"\)/;

function isKnownDynamicImport(diagnostic: CoachDiagnostic): boolean {
    const expression = SPECIFIER_EXPRESSION.exec(diagnostic.message)?.[1];
    return KNOWN_DYNAMIC_IMPORTS.some(
        (known) =>
            known.path === diagnostic.path && known.expression === expression,
    );
}

/**
 * A load with a non-literal specifier names no target, so coach cannot say
 * whether it crosses a layer and still exits 0. Only reviewed ones pass.
 */
function nonLiteralImportMessages(
    diagnostics: readonly CoachDiagnostic[],
): string[] {
    const unreviewed = diagnostics.filter(
        (diagnostic) =>
            diagnostic.kind === NON_LITERAL_IMPORT &&
            !isKnownDynamicImport(diagnostic),
    );
    if (unreviewed.length === 0) {
        return [];
    }
    return [
        `coach reported ${unreviewed.length} ${NON_LITERAL_IMPORT} diagnostic(s); layer rules cannot check an import whose specifier is not a string literal, so write it as a literal or add it to KNOWN_DYNAMIC_IMPORTS in scripts/architecture-gate/coach-verdict.ts after review:`,
        ...unreviewed.map(
            (diagnostic) =>
                `  ${diagnostic.path ?? "(no path)"}: ${diagnostic.message}`,
        ),
    ];
}

function verdictForReport(report: CoachReport): GateVerdict {
    const messages = [
        ...violationMessages(report.signals),
        ...membershipMessages(report.layerMembership),
        ...nonLiteralImportMessages(report.diagnostics),
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
 * lifecycle, no analyzed file outside every declared layer, and no unreviewed
 * import with a non-literal specifier. Every other outcome fails, so a broken
 * or unreadable run can never look like a clean one.
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
