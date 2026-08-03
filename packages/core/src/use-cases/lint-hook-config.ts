/**
 * Use case for linting hook configurations.
 * Validates GitHub Copilot and Claude Code hook config files.
 */

import type { core } from "zod";
import {
    CLAUDE_HOOK_EVENTS,
    type ClaudeHookEntry,
    ClaudeHooksConfigSchema,
    MATCHER_SUPPORTING_EVENTS,
} from "../entities/claude-hook-schema.js";
import { CopilotHooksConfigSchema } from "../entities/copilot-hook-schema.js";
import type {
    DiscoveredHookFile,
    HookLintDiagnostic,
    HookLintResult,
} from "../entities/hook.js";

export { ClaudeHooksConfigSchema, CopilotHooksConfigSchema };

const INVALID_JSON_MESSAGE_PREFIX = "Invalid JSON in hook configuration file";

/** Joins a Zod issue path into the dotted `field` shown on a diagnostic. */
function toFieldPath(path: PropertyKey[]): string | undefined {
    return path.length > 0 ? path.join(".") : undefined;
}

/**
 * Expands a single Zod issue into diagnostics.
 *
 * `unrecognized_keys` issues carry every offending key on one issue whose path
 * points at the *containing* object, so they are expanded into one diagnostic
 * per key. A stray key directly under `hooks` is a misspelled event name —
 * the most valuable defect this linter can catch, since Claude Code silently
 * never fires such a hook.
 */
function toClaudeDiagnostics(issue: core.$ZodIssue): HookLintDiagnostic[] {
    if (issue.code === "unrecognized_keys") {
        const isEventName =
            issue.path.length === 1 && issue.path[0] === "hooks";

        return issue.keys.map((key) => ({
            line: 1,
            severity: "error" as const,
            message: isEventName
                ? `Unknown hook event '${key}'. A misspelled event never fires. Valid events: ${CLAUDE_HOOK_EVENTS.join(", ")}`
                : `Unrecognized key: "${key}"`,
            field: [...issue.path, key].join("."),
            ruleId: isEventName ? "hook/unknown-event" : "hook/invalid-config",
        }));
    }

    const lastPathSegment = issue.path.at(-1);
    const isMissingCommand =
        lastPathSegment === "command" &&
        (issue.code === "too_small" || issue.code === "invalid_type");

    return [
        {
            line: 1,
            severity: "error",
            message: issue.message,
            field: toFieldPath([...issue.path]),
            ruleId: isMissingCommand
                ? "hook/missing-command"
                : "hook/invalid-config",
        },
    ];
}

/**
 * Warns when an entry omits `matcher` for an event that supports one.
 *
 * Events that accept no matcher (`Stop`, `UserPromptSubmit`, …) are skipped:
 * an omitted matcher there is the only valid spelling, not an oversight.
 */
function collectMissingMatcherWarnings(
    hooks: Record<string, readonly ClaudeHookEntry[] | undefined>,
): HookLintDiagnostic[] {
    const diagnostics: HookLintDiagnostic[] = [];

    for (const event of CLAUDE_HOOK_EVENTS) {
        if (!MATCHER_SUPPORTING_EVENTS.has(event)) {
            continue;
        }

        const entries = hooks[event] ?? [];

        entries.forEach((entry, index) => {
            if (entry.matcher === undefined) {
                diagnostics.push({
                    line: 1,
                    severity: "warning",
                    message: `Recommended field 'matcher' is missing from ${event} hook entry. Without a matcher, the hook runs for every occurrence.`,
                    field: `hooks.${event}[${index}].matcher`,
                    ruleId: "hook/missing-matcher",
                });
            }
        });
    }

    return diagnostics;
}

/**
 * Port for hook config lint gateway operations.
 */
export interface HookConfigLintGateway {
    discoverHookFiles(targetDir: string): Promise<DiscoveredHookFile[]>;
    readFileContent(filePath: string): Promise<string>;
}

/**
 * Input for the lint hook config use case.
 */
export interface LintHookConfigInput {
    targetDir: string;
}

/**
 * Output from the lint hook config use case.
 */
export interface LintHookConfigOutput {
    results: HookLintResult[];
    totalFiles: number;
    totalErrors: number;
    totalWarnings: number;
}

/**
 * Use case for linting hook configuration files across a repository.
 */
export class LintHookConfigUseCase {
    constructor(private readonly gateway: HookConfigLintGateway) {}

    async execute(input: LintHookConfigInput): Promise<LintHookConfigOutput> {
        if (!input.targetDir) {
            throw new Error("Target directory is required");
        }

        const hookFiles = await this.gateway.discoverHookFiles(input.targetDir);

        const results: HookLintResult[] = [];

        for (const hookFile of hookFiles) {
            const content = await this.gateway.readFileContent(
                hookFile.filePath,
            );
            const result = this.lintHookFile(hookFile, content);
            results.push(result);
        }

        const totalErrors = results.reduce(
            (sum, r) =>
                sum +
                r.diagnostics.filter((d) => d.severity === "error").length,
            0,
        );
        const totalWarnings = results.reduce(
            (sum, r) =>
                sum +
                r.diagnostics.filter((d) => d.severity === "warning").length,
            0,
        );

        return {
            results,
            totalFiles: hookFiles.length,
            totalErrors,
            totalWarnings,
        };
    }

    private lintHookFile(
        hookFile: DiscoveredHookFile,
        content: string,
    ): HookLintResult {
        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (error) {
            const errorMessage =
                error instanceof Error && error.message
                    ? `${INVALID_JSON_MESSAGE_PREFIX}: ${error.message}`
                    : `${INVALID_JSON_MESSAGE_PREFIX}.`;
            return {
                filePath: hookFile.filePath,
                platform: hookFile.platform,
                diagnostics: [
                    {
                        line: 1,
                        severity: "error",
                        message: errorMessage,
                        ruleId: "hook/invalid-json",
                    },
                ],
                valid: false,
            };
        }

        const diagnostics =
            hookFile.platform === "copilot"
                ? this.validateCopilotConfig(parsed)
                : this.validateClaudeConfig(parsed);

        return {
            filePath: hookFile.filePath,
            platform: hookFile.platform,
            diagnostics,
            valid: diagnostics.every((d) => d.severity !== "error"),
        };
    }

    private validateCopilotConfig(parsed: unknown): HookLintDiagnostic[] {
        const diagnostics: HookLintDiagnostic[] = [];

        const result = CopilotHooksConfigSchema.safeParse(parsed);

        if (!result.success) {
            for (const issue of result.error.issues) {
                const lastPathSegment =
                    issue.path.length > 0
                        ? issue.path[issue.path.length - 1]
                        : undefined;
                const isCommandField =
                    lastPathSegment === "bash" ||
                    lastPathSegment === "powershell";
                const isMissingCommand =
                    // Refine failure: neither bash nor powershell provided.
                    // Keyed off code===custom at the command-object level — the last
                    // path segment is an array index (number), not a named field.
                    (issue.code === "custom" && !isCommandField) ||
                    // Field-level failure: bash/powershell present but empty or wrong type
                    (isCommandField &&
                        (issue.code === "too_small" ||
                            issue.code === "invalid_type"));

                diagnostics.push({
                    line: 1,
                    severity: "error",
                    message: issue.message,
                    field:
                        issue.path.length > 0
                            ? issue.path.join(".")
                            : undefined,
                    ruleId: isMissingCommand
                        ? "hook/missing-command"
                        : "hook/invalid-config",
                });
            }

            return diagnostics;
        }

        const lifecycleNames = [
            "sessionStart",
            "userPromptSubmitted",
            "preToolUse",
            "postToolUse",
            "sessionEnd",
        ] as const;

        for (const lifecycleName of lifecycleNames) {
            const hooksForLifecycle = result.data.hooks[lifecycleName] ?? [];

            hooksForLifecycle.forEach((hook, index) => {
                if (hook.timeoutSec === undefined) {
                    diagnostics.push({
                        line: 1,
                        severity: "warning",
                        message:
                            "Recommended field 'timeoutSec' is missing from hook command",
                        field: `hooks.${lifecycleName}[${index}].timeoutSec`,
                        ruleId: "hook/missing-timeout",
                    });
                }
            });
        }

        return diagnostics;
    }

    private validateClaudeConfig(parsed: unknown): HookLintDiagnostic[] {
        const result = ClaudeHooksConfigSchema.safeParse(parsed);

        if (!result.success) {
            return result.error.issues.flatMap((issue) =>
                toClaudeDiagnostics(issue),
            );
        }

        return collectMissingMatcherWarnings(result.data.hooks);
    }
}
