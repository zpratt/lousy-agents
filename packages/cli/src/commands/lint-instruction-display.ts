/**
 * Instruction-quality display for the lint CLI command.
 */

import type { LintOutput, LintSeverity } from "@lousy-agents/lint";
import { type ConsolaInstance, consola } from "consola";

const SEVERITY_METHODS: Record<LintSeverity, "error" | "warn" | "info"> = {
    error: "error",
    warning: "warn",
    info: "info",
};

function warnSuggestions(
    suggestions: ReadonlyArray<{ message: string }>,
    logger: ConsolaInstance,
): void {
    for (const suggestion of suggestions) {
        logger.warn(suggestion.message);
    }
}

function logDiagnostic(
    d: LintOutput["diagnostics"][number],
    logger: ConsolaInstance,
): void {
    const fieldInfo = d.field ? ` [${d.field}]` : "";
    const message = `${d.filePath}:${d.line}${fieldInfo}: ${d.message}`;
    logger[SEVERITY_METHODS[d.severity]](message);
}

/**
 * Displays instruction quality analysis results using consola, or the logger
 * it is given.
 */
export function displayInstructionQuality(
    output: LintOutput,
    logger: ConsolaInstance = consola,
): void {
    const result = output.qualityResult;
    if (!result) {
        return;
    }

    if (result.discoveredFiles.length === 0) {
        logger.info("No instruction files found");
        // Diagnostics that concern the whole run, such as a discovery limit,
        // exist precisely when files may be missing: never drop them here.
        for (const d of output.diagnostics) {
            logDiagnostic(d, logger);
        }
        warnSuggestions(result.suggestions, logger);
        return;
    }

    logger.info(
        `Discovered ${result.discoveredFiles.length} instruction file(s)`,
    );
    for (const file of result.discoveredFiles) {
        logger.info(`  ${file.filePath} (${file.format})`);
    }
    if (result.effectiveDocuments !== undefined) {
        for (const doc of result.effectiveDocuments) {
            logger.info(
                `  ${doc.effectiveRoot}: ${doc.resolvedImports.length} resolved import(s)`,
            );
        }
    }
    logger.info(
        `Overall instruction quality score: ${result.overallQualityScore}%`,
    );
    for (const d of output.diagnostics) {
        logDiagnostic(d, logger);
    }
    warnSuggestions(result.suggestions, logger);
}
