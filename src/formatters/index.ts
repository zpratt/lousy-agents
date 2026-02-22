/**
 * Formatter module exports.
 * Factory function returns the appropriate formatter based on format type.
 */

import { HumanFormatter } from "./human-formatter.js";
import { JsonFormatter } from "./json-formatter.js";
import { RdjsonlFormatter } from "./rdjsonl-formatter.js";
import type { LintFormatType, LintFormatter } from "./types.js";

export type { LintFormatType, LintFormatter } from "./types.js";

/**
 * Creates a formatter based on the specified format type.
 */
export function createFormatter(format: LintFormatType): LintFormatter {
    switch (format) {
        case "json":
            return new JsonFormatter();
        case "rdjsonl":
            return new RdjsonlFormatter();
        case "human":
        default:
            return new HumanFormatter();
    }
}
