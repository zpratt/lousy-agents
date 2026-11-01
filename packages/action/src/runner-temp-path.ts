/**
 * Validation of the paths the action writes to, taken from the environment.
 */

import { isAbsolute, resolve, sep } from "node:path";
import { z } from "zod";

/**
 * A path the action may write to: absolute, with no traversal segment, and
 * strictly inside RUNNER_TEMP (not RUNNER_TEMP itself, not a sibling that only
 * shares its prefix).
 */
function runnerTempPathSchema(runnerTemp: string) {
    const root = resolve(runnerTemp);
    return z
        .string()
        .refine((value) => !value.includes("\0"), "must not contain a NUL byte")
        .refine((value) => isAbsolute(value), "must be an absolute path")
        .refine(
            (value) => !value.split(/[\\/]/).includes(".."),
            "must not contain a traversal segment",
        )
        .refine(
            (value) => resolve(value).startsWith(`${root}${sep}`),
            "must be inside RUNNER_TEMP",
        );
}

/**
 * Validates a path taken from the environment that the action will write to.
 * Returns undefined when the variable is not set. Throws, naming the variable,
 * when it is set but unacceptable, or when RUNNER_TEMP cannot anchor it.
 */
export function validateRunnerTempPath(
    value: string | undefined,
    runnerTemp: string | undefined,
    variableName: string,
): string | undefined {
    if (value === undefined || value === "") {
        return undefined;
    }
    if (runnerTemp === undefined || !isAbsolute(runnerTemp)) {
        throw new Error(
            `${variableName} is set but RUNNER_TEMP is missing or not an absolute path`,
        );
    }
    const result = runnerTempPathSchema(runnerTemp).safeParse(value);
    if (!result.success) {
        throw new Error(
            `${variableName} ${result.error.issues[0]?.message ?? "is invalid"}: ${JSON.stringify(value)}`,
        );
    }
    return result.data;
}
