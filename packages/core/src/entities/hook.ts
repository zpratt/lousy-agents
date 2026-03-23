/**
 * Core domain entities for pre-tool-use hook configurations.
 * Defines types for both GitHub Copilot and Claude Code hook formats.
 */

/** Supported hook platform identifiers */
export type HookPlatform = "copilot" | "claude";

/** Severity levels for hook lint diagnostics */
export type HookLintSeverity = "error" | "warning";

/** A single lint diagnostic for a hook configuration file */
export interface HookLintDiagnostic {
    readonly line: number;
    readonly severity: HookLintSeverity;
    readonly message: string;
    readonly field?: string;
    readonly ruleId: string;
}

/** Lint result for a single hook configuration file */
export interface HookLintResult {
    readonly filePath: string;
    readonly platform: HookPlatform;
    readonly diagnostics: readonly HookLintDiagnostic[];
    readonly valid: boolean;
}

/** A discovered hook configuration file on disk */
export interface DiscoveredHookFile {
    readonly filePath: string;
    readonly platform: HookPlatform;
}
