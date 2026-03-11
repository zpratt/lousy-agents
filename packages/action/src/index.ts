/**
 * GitHub Action entry point.
 * Reads inputs from environment variables, runs lint, and outputs rdjsonl to stdout.
 */

import { runLint } from "./run-lint.js";
import { readActionInputs } from "./validate-inputs.js";

async function main(): Promise<void> {
    const inputs = await readActionInputs(process.env);

    const { output, hasErrors } = await runLint(inputs);

    if (output) {
        process.stdout.write(`${output}\n`);
    }

    if (hasErrors) {
        process.exitCode = 1;
    }
}

main().catch((error: unknown) => {
    if (error instanceof Error) {
        process.stderr.write(`Error: ${error.message}\n`);
        if (error.stack) {
            process.stderr.write(`${error.stack}\n`);
        }
    } else {
        process.stderr.write(`Error: ${String(error)}\n`);
    }
    process.exitCode = 1;
});
