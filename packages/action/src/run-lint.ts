/**
 * Lint orchestration for the GitHub Action.
 * Delegates to the lint package facade and formats output as rdjsonl.
 */

import { createFormatter, runLint as lintProject } from "@lousy-agents/lint";
import type { ActionInputs } from "./validate-inputs.js";

/**
 * Runs lint for the specified targets and returns rdjsonl-formatted output.
 * Returns an object with the formatted string and whether errors were found.
 */
export async function runLint(
    inputs: ActionInputs,
): Promise<{ output: string; hasErrors: boolean }> {
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

    return { output: formatted, hasErrors: result.hasErrors };
}
