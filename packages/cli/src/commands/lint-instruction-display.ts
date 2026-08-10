/**
 * Instruction-quality display for the lint CLI command.
 */

import type { LintOutput } from "@lousy-agents/lint";
import { consola } from "consola";

const SEVERITY_LOGGERS = {
    error: (msg: string) => consola.error(msg),
    warning: (msg: string) => consola.warn(msg),
    info: (msg: string) => consola.info(msg),
} as const;

function warnSuggestions(
    suggestions: ReadonlyArray<{ message: string }>,
): void {
    for (const suggestion of suggestions) {
        consola.warn(suggestion.message);
    }
}

function logDiagnostic(d: LintOutput["diagnostics"][number]): void {
    const fieldInfo = d.field ? ` [${d.field}]` : "";
    const message = `${d.filePath}:${d.line}${fieldInfo}: ${d.message}`;
    const log =
        SEVERITY_LOGGERS[d.severity as keyof typeof SEVERITY_LOGGERS] ??
        SEVERITY_LOGGERS.info;
    log(message);
}

/**
 * Displays instruction quality analysis results using consola.
 */
export function displayInstructionQuality(output: LintOutput): void {
    const result = output.qualityResult;
    if (!result) {
        return;
    }

    if (result.discoveredFiles.length === 0) {
        consola.info("No instruction files found");
        warnSuggestions(result.suggestions);
        return;
    }

    consola.info(
        `Discovered ${result.discoveredFiles.length} instruction file(s)`,
    );
    for (const file of result.discoveredFiles) {
        consola.info(`  ${file.filePath} (${file.format})`);
    }
    if (result.effectiveDocuments !== undefined) {
        for (const doc of result.effectiveDocuments) {
            consola.info(
                `  ${doc.effectiveRoot}: ${doc.resolvedImports.length} resolved import(s)`,
            );
        }
    }
    consola.info(
        `Overall instruction quality score: ${result.overallQualityScore}%`,
    );
    for (const d of output.diagnostics) {
        logDiagnostic(d);
    }
    warnSuggestions(result.suggestions);
}
