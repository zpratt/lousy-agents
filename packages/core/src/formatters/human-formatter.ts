/**
 * Human-readable formatter for lint diagnostics.
 * Uses simple text formatting with severity indicators.
 */

import type { LintOutput, LintSeverity } from "../entities/lint.js";
import type { LintFormatter } from "./types.js";

const SEVERITY_ICONS: Record<LintSeverity, string> = {
    error: "✖",
    warning: "⚠",
    info: "ℹ",
};

/**
 * An output with no files and no diagnostics has nothing to show. One with
 * diagnostics but no files (for example a discovery limit that hid every
 * file) must still be shown.
 */
function hasNothingToShow(output: LintOutput): boolean {
    return output.summary.totalFiles === 0 && output.diagnostics.length === 0;
}

function okLines(output: LintOutput): string[] {
    const filesWithDiagnostics = new Set(
        output.diagnostics.map((d) => d.filePath),
    );
    return output.filesAnalyzed
        .filter((file) => !filesWithDiagnostics.has(file))
        .map((file) => `✔ ${file}: OK`);
}

function diagnosticLines(output: LintOutput): string[] {
    return output.diagnostics.map((d) => {
        const fieldInfo = d.field ? ` [${d.field}]` : "";
        return `${SEVERITY_ICONS[d.severity]} ${d.filePath}:${d.line}${fieldInfo}: ${d.message}`;
    });
}

/**
 * Formats lint output for human-readable console display.
 */
export class HumanFormatter implements LintFormatter {
    format(outputs: readonly LintOutput[]): string {
        return outputs
            .filter((output) => !hasNothingToShow(output))
            .flatMap((output) => [
                ...okLines(output),
                ...diagnosticLines(output),
            ])
            .join("\n");
    }
}
