/**
 * GitHub Action entry point.
 * Reads inputs from environment variables, runs lint, and outputs rdjsonl to stdout.
 */

import { runLint } from "./run-lint.js";
import { readActionInputs } from "./validate-inputs.js";

async function main(): Promise<void> {
    const inputs = readActionInputs(process.env);

    const { output, hasErrors } = await runLint(inputs);

    if (output) {
        process.stdout.write(`${output}\n`);
    }

    if (hasErrors) {
        process.exitCode = 1;
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
});
