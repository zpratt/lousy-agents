/**
 * Reviewdog Diagnostic Format (JSON Lines) formatter.
 * Compatible with `reviewdog -f=rdjsonl`.
 */

import type { LintOutput } from "../entities/lint.js";
import type { LintFormatter } from "./types.js";

/**
 * Reviewdog diagnostic format entry.
 */
interface RdjsonlDiagnostic {
    message: string;
    location: {
        path: string;
        range: {
            start: {
                line: number;
                column?: number;
            };
            end?: {
                line?: number;
                column?: number;
            };
        };
    };
    severity: "ERROR" | "WARNING" | "INFO";
    code?: {
        value: string;
    };
}

/**
 * Maps LintSeverity to reviewdog severity.
 */
function mapSeverity(severity: string): "ERROR" | "WARNING" | "INFO" {
    switch (severity) {
        case "error":
            return "ERROR";
        case "warning":
            return "WARNING";
        default:
            return "INFO";
    }
}

/**
 * Formats lint output as JSON Lines for reviewdog.
 */
export class RdjsonlFormatter implements LintFormatter {
    format(outputs: LintOutput[]): string {
        const lines: string[] = [];

        for (const output of outputs) {
            for (const d of output.diagnostics) {
                const entry: RdjsonlDiagnostic = {
                    message: d.message,
                    location: {
                        path: d.filePath,
                        range: {
                            start: {
                                line: d.line,
                                column: d.column,
                            },
                            end:
                                d.endLine !== undefined
                                    ? {
                                          line: d.endLine,
                                          column: d.endColumn,
                                      }
                                    : undefined,
                        },
                    },
                    severity: mapSeverity(d.severity),
                    code: d.ruleId ? { value: d.ruleId } : undefined,
                };

                lines.push(JSON.stringify(entry));
            }
        }

        return lines.join("\n");
    }
}
