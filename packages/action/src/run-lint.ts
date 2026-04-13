/**
 * Lint orchestration for the GitHub Action.
 * Delegates to the core runLint facade and formats output as rdjsonl.
 */

import { createFormatter } from "@lousy-agents/core/formatters/index.js";
import { runLint as coreRunLint } from "@lousy-agents/core/lint.js";
import type { ActionInputs } from "./validate-inputs.js";

/**
 * Runs lint for the specified targets and returns rdjsonl-formatted output.
 * Returns an object with the formatted string and whether errors were found.
 */
export async function runLint(
    inputs: ActionInputs,
): Promise<{ output: string; hasErrors: boolean }> {
    const result = await coreRunLint({
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
