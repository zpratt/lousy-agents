/**
 * Selects the diagnostics that describe the whole run, which reviewdog cannot
 * place on a changed line and so may filter out.
 */

import {
    isRunLevelRuleId,
    type LintDiagnostic,
    type LintOutput,
} from "@lousy-agents/lint";

export function selectRunLevelDiagnostics(
    outputs: readonly LintOutput[],
): LintDiagnostic[] {
    return outputs
        .flatMap((output) => output.diagnostics)
        .filter((diagnostic) => isRunLevelRuleId(diagnostic.ruleId));
}
