/**
 * GitHub Action entry point.
 * Reads inputs from environment variables, runs lint, and outputs rdjsonl to stdout.
 */

import { publishRunLevelDiagnostics } from "./annotations.js";
import { runLint } from "./run-lint.js";
import { readActionInputs } from "./validate-inputs.js";

async function main(): Promise<void> {
    const inputs = await readActionInputs(process.env);

    const { output, hasErrors, runLevelDiagnostics } = await runLint(inputs);

    if (output) {
        process.stdout.write(`${output}\n`);
    }

    // reviewdog's diff filter drops findings that are not on a changed line,
    // such as "discovery stopped at its directory limit", and stdout is its
    // input. Publish them on a channel of their own: a truncated scan must
    // never be silent.
    await publishRunLevelDiagnostics(runLevelDiagnostics, {
        annotationsFile: inputs.annotationsFile,
        stepSummaryFile: inputs.stepSummaryFile,
        writeStderr: (text) => process.stderr.write(text),
    });

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
