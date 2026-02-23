/**
 * Shared interface for lint output formatters.
 */

import type { LintOutput } from "../entities/lint.js";

/**
 * A formatter that renders lint outputs to a string.
 */
export interface LintFormatter {
    format(outputs: LintOutput[]): string;
}

/** Supported output format values */
export type LintFormatType = "human" | "json" | "rdjsonl";
