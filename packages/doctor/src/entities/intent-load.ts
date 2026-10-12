/**
 * Outcome of attempting to load `.agentic-doctor/intent.json`.
 *
 * `absent` means no file exists at the checked path. Every other non-`loaded`
 * status means a file is present but was rejected, so declared intent is
 * treated as undeclared for the run.
 */
export const INTENT_LOAD_STATUSES = [
    "loaded",
    "absent",
    "invalid-json",
    "invalid-schema",
    "symlink-rejected",
    "read-failed",
] as const;

export type IntentLoadStatus = (typeof INTENT_LOAD_STATUSES)[number];

export interface IntentSchemaIssue {
    /** Dot-separated field path, e.g. `targetHarnesses.1`; `(root)` for the document itself. */
    path: string;
    message: string;
}

export interface IntentLoadReport {
    status: IntentLoadStatus;
    /** Absolute path doctor checked; doctor never searches parent or home directories. */
    checkedPath: string;
    /** Safe, human-readable cause. Never contains file contents. Omitted when loaded. */
    reason?: string;
    /** Field-level schema problems; present only for `invalid-schema`. */
    issues?: IntentSchemaIssue[];
    /** Number of schema issues not listed in `issues`; present only when some were dropped. */
    omittedIssueCount?: number;
}

export function isIntentRejected(status: IntentLoadStatus): boolean {
    return status !== "loaded" && status !== "absent";
}
