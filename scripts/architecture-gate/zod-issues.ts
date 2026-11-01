import type { z } from "zod";
import { GateError } from "./gate-error.js";

interface IssueWithPath {
    readonly path?: readonly PropertyKey[];
}

/** `["layers", 0, "name"]` becomes `layers[0].name`. */
function pathLabel(path: readonly PropertyKey[]): string {
    return path.reduce<string>((label, segment) => {
        if (typeof segment === "number") {
            return `${label}[${segment}]`;
        }
        return label === "" ? String(segment) : `${label}.${String(segment)}`;
    }, "");
}

function subject(issue: IssueWithPath, fallback: string): string {
    const label = pathLabel(issue.path ?? []);
    return label === "" ? fallback : label;
}

/** Error text for a value that should be a JSON object, named by where it sits. */
export function mustBeObject(fallback: string) {
    return {
        error: (issue: IssueWithPath) =>
            `${subject(issue, fallback)} must be a JSON object`,
    };
}

/** Error text for a value that should be a list, named by where it sits. */
export function mustBeArray(fallback: string) {
    return {
        error: (issue: IssueWithPath) =>
            `${subject(issue, fallback)} must be an array`,
    };
}

/** Error text for a value that should be text with something in it. */
export function mustBeNonEmptyText(issue: IssueWithPath): string {
    return `${subject(issue, "value")} must be a non-empty string`;
}

/** The gate's error for the first thing wrong with the input. */
export function firstIssueError(error: z.ZodError): GateError {
    return new GateError(error.issues[0]?.message ?? "input is not valid");
}
