/**
 * Lint orchestration for the GitHub Action.
 * Delegates to the lint package facade and formats output as rdjsonl.
 */

import {
    createFormatter,
    type LintDiagnostic,
    runLint as lintProject,
} from "@lousy-agents/lint";
import { selectRunLevelDiagnostics } from "./run-level-diagnostics.js";
import type { ActionInputs } from "./validate-inputs.js";

/**
 * Runs lint for the specified targets and returns rdjsonl-formatted output,
 * whether errors were found, and the diagnostics that describe the whole run.
 * Those still appear in the rdjsonl, but reviewdog's diff filter can drop them,
 * so the caller also annotates the run with them directly.
 */
export async function runLint(inputs: ActionInputs): Promise<{
    output: string;
    hasErrors: boolean;
    runLevelDiagnostics: LintDiagnostic[];
}> {
    const result = await lintProject({
        directory: inputs.directory,
        targets: {
            skills: inputs.skills,
            agents: inputs.agents,
            hooks: inputs.hooks,
            instructions: inputs.instructions,
        },
    });

    const formatter = createFormatter("rdjsonl");
    const formatted = formatter.format(result.outputs);

    return {
        output: formatted,
        hasErrors: result.hasErrors,
        runLevelDiagnostics: selectRunLevelDiagnostics(result.outputs),
    };
}
