// biome-ignore-all lint/style/useNamingConvention: Claude Code API uses PascalCase hook event names (PreToolUse)
/**
 * Use case for linting pre-tool-use hook configurations.
 * Validates GitHub Copilot and Claude Code hook config files.
 */

import { z } from "zod";
import { CopilotHooksConfigSchema } from "../entities/copilot-hook-schema.js";
import type {
    DiscoveredHookFile,
    HookLintDiagnostic,
    HookLintResult,
} from "../entities/hook.js";

export { CopilotHooksConfigSchema };

const INVALID_JSON_MESSAGE_PREFIX = "Invalid JSON in hook configuration file";

/**
 * Zod schema for a single Claude Code hook command entry.
 */
const ClaudeHookCommandSchema = z
    .object({
        type: z.literal("command"),
        command: z.string().min(1, "Hook command must not be empty"),
    })
    .strict();

/**
 * Zod schema for a single Claude Code PreToolUse hook entry.
 */
const ClaudePreToolUseEntrySchema = z
    .object({
        matcher: z.string().optional(),
        hooks: z.array(ClaudeHookCommandSchema).min(1),
    })
    .strict();

/**
 * Zod schema for the Claude Code hooks section within settings.
 */
export const ClaudeHooksConfigSchema = z
    .object({
        hooks: z
            .object({
                PreToolUse: z.array(ClaudePreToolUseEntrySchema).min(1),
            })
            .passthrough(),
    })
    .passthrough();

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
        const diagnostics: HookLintDiagnostic[] = [];

        const result = ClaudeHooksConfigSchema.safeParse(parsed);

        if (!result.success) {
            for (const issue of result.error.issues) {
                const lastPathSegment =
                    issue.path.length > 0
                        ? issue.path[issue.path.length - 1]
                        : undefined;
                const isMissingCommand =
                    lastPathSegment === "command" &&
                    (issue.code === "too_small" ||
                        issue.code === "invalid_type");

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

        for (const [index, entry] of result.data.hooks.PreToolUse.entries()) {
            if (entry.matcher === undefined) {
                diagnostics.push({
                    line: 1,
                    severity: "warning",
                    message:
                        "Recommended field 'matcher' is missing from PreToolUse hook entry. Without a matcher, the hook runs for all tools.",
                    field: `hooks.PreToolUse[${index}].matcher`,
                    ruleId: "hook/missing-matcher",
                });
            }
        }

        return diagnostics;
    }
}
