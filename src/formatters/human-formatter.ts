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
 * Formats lint output for human-readable console display.
 */
export class HumanFormatter implements LintFormatter {
    format(outputs: LintOutput[]): string {
        const lines: string[] = [];

        for (const output of outputs) {
            if (output.summary.totalFiles === 0) {
                continue;
            }

            const filesWithDiagnostics = new Set<string>();
            for (const d of output.diagnostics) {
                filesWithDiagnostics.add(d.filePath);
            }

            for (const file of output.filesAnalyzed) {
                if (!filesWithDiagnostics.has(file)) {
                    lines.push(`✔ ${file}: OK`);
                }
            }

            for (const d of output.diagnostics) {
                const prefix = `${d.filePath}:${d.line}`;
                const fieldInfo = d.field ? ` [${d.field}]` : "";
                const icon = SEVERITY_ICONS[d.severity];
                lines.push(`${icon} ${prefix}${fieldInfo}: ${d.message}`);
            }
        }

        return lines.join("\n");
    }
}
