/**
 * Human-readable display helpers for the lint CLI command.
 */

import type { LintFormatType, LintOutput } from "@lousy-agents/lint";
import { createFormatter } from "@lousy-agents/lint";
import { consola } from "consola";
import { displayInstructionQuality } from "./lint-instruction-display.js";
import { targetLabel } from "./lint-target-labels.js";

const SEVERITY_LOGGERS = {
    error: (msg: string) => consola.error(msg),
    warning: (msg: string) => consola.warn(msg),
    info: (msg: string) => consola.info(msg),
} as const;

function logDiagnostic(d: LintOutput["diagnostics"][number]): void {
    const fieldInfo = d.field ? ` [${d.field}]` : "";
    const message = `${d.filePath}:${d.line}${fieldInfo}: ${d.message}`;
    const log =
        SEVERITY_LOGGERS[d.severity as keyof typeof SEVERITY_LOGGERS] ??
        SEVERITY_LOGGERS.info;
    log(message);
}

function displayOkFiles(output: LintOutput): void {
    const filesWithDiagnostics = new Set(
        output.diagnostics.map((d) => d.filePath),
    );
    for (const file of output.filesAnalyzed) {
        if (filesWithDiagnostics.has(file)) {
            continue;
        }
        consola.success(`${file}: OK`);
    }
}

function displayLintOutput(output: LintOutput, label: string): void {
    if (output.summary.totalFiles === 0) {
        consola.info(`No ${label} found`);
        return;
    }

    consola.info(`Discovered ${output.summary.totalFiles} ${label}`);
    displayOkFiles(output);
    for (const d of output.diagnostics) {
        logDiagnostic(d);
    }
}

function displayHumanOutputs(outputs: readonly LintOutput[]): void {
    for (const output of outputs) {
        if (output.target === "instruction") {
            displayInstructionQuality(output);
            continue;
        }
        displayLintOutput(output, targetLabel(output.target));
    }
}

export function displayFormattedOutputs(
    outputs: readonly LintOutput[],
    format: LintFormatType,
): void {
    if (format === "human") {
        displayHumanOutputs(outputs);
        return;
    }

    const formatted = createFormatter(format).format(outputs);
    if (!formatted) {
        return;
    }
    process.stdout.write(`${formatted}\n`);
}

export function sumWarnings(outputs: readonly LintOutput[]): number {
    return outputs.reduce(
        (sum, output) => sum + output.summary.totalWarnings,
        0,
    );
}
