import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
    readTextWithinRoot,
    resolveSafePath,
} from "@lousy-agents/core/gateways/file-system-utils.js";
import { z } from "zod";
import type { DeclaredIntentArtifact } from "../entities/declared-intent.js";
import type { HarnessName } from "../entities/edge-types.js";
import type {
    IntentLoadReport,
    IntentSchemaIssue,
} from "../entities/intent-load.js";

const MAX_INTENT_BYTES = 65_536;

const ARTIFACT_FILENAME = "intent.json";
const ARTIFACT_DIR = ".agentic-doctor";

const DeclaredIntentSchema = z.object({
    targetHarnesses: z.array(
        z.enum([
            "claude",
            "copilot",
            "codex",
            "antigravity",
            "hermes",
            "crush",
            "pi",
            "shared",
        ]),
    ),
    desiredCapabilities: z.array(z.string()),
    confirmedAnswers: z.record(z.string(), z.unknown()),
    intentSource: z.enum(["interactive", "ci-assumed", "pre-committed"]),
    snapshotRef: z.string().optional(),
});

export interface IntentArtifactResult {
    found: true;
    artifact: DeclaredIntentArtifact;
    path: string;
    report: IntentLoadReport;
}

export interface IntentArtifactMissing {
    found: false;
    report: IntentLoadReport;
}

export type ReadIntentResult = IntentArtifactResult | IntentArtifactMissing;

const MAX_SCHEMA_ISSUES = 20;

const ErrorCodeSchema = z.object({ code: z.string() });

const ErrorCauseSchema = z.object({ cause: z.unknown() });

function readErrorCode(value: unknown): string | undefined {
    const parsed = ErrorCodeSchema.safeParse(value);
    return parsed.success ? parsed.data.code : undefined;
}

/**
 * Extracts fs-safe / errno codes from the error and, when present, its cause.
 * Each is parsed independently so a cause without a code never hides the
 * top-level code. Error messages are deliberately ignored so diagnostics
 * never depend on wording.
 */
function readErrorCodes(error: unknown): string[] {
    const cause = ErrorCauseSchema.safeParse(error);
    return [
        readErrorCode(error),
        cause.success ? readErrorCode(cause.data.cause) : undefined,
    ].filter((code): code is string => code !== undefined);
}

function classifyReadError(
    error: unknown,
    checkedPath: string,
): IntentLoadReport {
    const codes = readErrorCodes(error);
    const has = (code: string) => codes.includes(code);

    // ENOTDIR: a path segment such as `.agentic-doctor` is a regular file,
    // so no intent file can exist at the checked path.
    if (has("not-found") || has("ENOENT") || has("ENOTDIR")) {
        return {
            status: "absent",
            checkedPath,
            reason: "No file exists at the checked path.",
        };
    }
    if (has("symlink") || has("path-alias")) {
        return {
            status: "symlink-rejected",
            checkedPath,
            reason: "The checked path is or passes through a symbolic link. The intent file must be a regular file inside the repository.",
        };
    }
    if (has("hardlink")) {
        return {
            status: "read-failed",
            checkedPath,
            reason: "The file is a hard link. The intent file must be a regular file with a single link.",
        };
    }
    if (has("not-file") || has("EISDIR")) {
        return {
            status: "read-failed",
            checkedPath,
            reason: "The checked path is not a regular file.",
        };
    }
    if (has("too-large")) {
        return {
            status: "read-failed",
            checkedPath,
            reason: `The file exceeds the ${MAX_INTENT_BYTES}-byte size limit.`,
        };
    }
    const errnoCode = codes.find((code) => /^E[A-Z]+$/.test(code));
    return {
        status: "read-failed",
        checkedPath,
        reason: errnoCode
            ? `The file could not be read (${errnoCode}).`
            : "The file could not be read.",
    };
}

function toSchemaIssues(
    error: z.ZodError,
): Pick<IntentLoadReport, "issues" | "omittedIssueCount"> {
    const issues: IntentSchemaIssue[] = error.issues
        .slice(0, MAX_SCHEMA_ISSUES)
        .map((issue) => ({
            path:
                issue.path.length > 0
                    ? issue.path.map(String).join(".")
                    : "(root)",
            message: issue.message,
        }));
    const omittedIssueCount = error.issues.length - issues.length;
    return omittedIssueCount > 0 ? { issues, omittedIssueCount } : { issues };
}

export async function readIntentArtifact(
    repoRoot: string,
): Promise<ReadIntentResult> {
    const artifactRelPath = `${ARTIFACT_DIR}/${ARTIFACT_FILENAME}`;
    const artifactPath = resolve(repoRoot, ARTIFACT_DIR, ARTIFACT_FILENAME);

    let raw: string;
    try {
        raw = await readTextWithinRoot(
            repoRoot,
            artifactRelPath,
            MAX_INTENT_BYTES,
        );
    } catch (error: unknown) {
        return {
            found: false,
            report: classifyReadError(error, artifactPath),
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        // The parser message can quote file contents, so it is not surfaced.
        return {
            found: false,
            report: {
                status: "invalid-json",
                checkedPath: artifactPath,
                reason: "The file is not valid JSON.",
            },
        };
    }

    const result = DeclaredIntentSchema.safeParse(parsed);
    if (!result.success) {
        return {
            found: false,
            report: {
                status: "invalid-schema",
                checkedPath: artifactPath,
                reason: "The file does not match the intent schema.",
                ...toSchemaIssues(result.error),
            },
        };
    }

    return {
        found: true,
        artifact: result.data,
        path: artifactPath,
        report: { status: "loaded", checkedPath: artifactPath },
    };
}

export async function writeIntentArtifact(
    repoRoot: string,
    artifact: DeclaredIntentArtifact,
): Promise<string> {
    const artifactPath = await resolveSafePath(
        repoRoot,
        `${ARTIFACT_DIR}/${ARTIFACT_FILENAME}`,
    );
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf-8");
    return artifactPath;
}

export function buildDefaultIntent(
    harnesses: HarnessName[],
): DeclaredIntentArtifact {
    return {
        targetHarnesses: harnesses.filter((h) => h !== "shared"),
        desiredCapabilities: [],
        confirmedAnswers: {},
        intentSource: "ci-assumed",
    };
}
