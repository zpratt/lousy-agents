/**
 * Instruction-quality display for the lint CLI command.
 */

import type { LintOutput } from "@lousy-agents/lint";
import { consola } from "consola";

function warnSuggestions(
    suggestions: ReadonlyArray<{ message: string }>,
): void {
    for (const suggestion of suggestions) {
        consola.warn(suggestion.message);
    }
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
    warnSuggestions(result.suggestions);
}
