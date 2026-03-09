/**
 * JSON formatter for lint diagnostics.
 * Outputs structured JSON array of LintDiagnostic objects.
 */

import type { LintOutput } from "../entities/lint.js";
import type { LintFormatter } from "./types.js";

/**
 * Formats lint output as a JSON string.
 */
export class JsonFormatter implements LintFormatter {
    format(outputs: LintOutput[]): string {
        const allDiagnostics = outputs.flatMap((o) => o.diagnostics);
        return JSON.stringify(allDiagnostics, null, 2);
    }
}
