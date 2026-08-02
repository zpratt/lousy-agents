/**
 * Pass/fail summary reporting for the lint CLI command.
 */

import type { LintFormatType, LintOutput } from "@lousy-agents/lint";
import { consola } from "consola";
import { targetLabel } from "./lint-target-labels.js";

export function reportFailure(
    outputs: readonly LintOutput[],
    totalWarnings: number,
    format: LintFormatType,
): void {
    process.exitCode = 1;
    if (format !== "human") {
        return;
    }
    const totalErrors = outputs.reduce(
        (sum, o) => sum + o.summary.totalErrors,
        0,
    );
    consola.error(
        `lint failed: ${totalErrors} error(s), ${totalWarnings} warning(s)`,
    );
}

export function reportSuccess(
    outputs: readonly LintOutput[],
    totalWarnings: number,
    format: LintFormatType,
): void {
    if (format !== "human") {
        return;
    }
    if (totalWarnings > 0) {
        consola.warn(`Lint passed with ${totalWarnings} warning(s)`);
        return;
    }
    const targets = outputs.map((o) => targetLabel(o.target)).join(", ");
    consola.success(`All ${targets} passed lint checks`);
}
