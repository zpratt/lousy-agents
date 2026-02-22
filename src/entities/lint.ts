/**
 * Shared lint diagnostic types for all lint targets.
 * Provides a unified diagnostic model for skills, agents, and instructions.
 */

/** Severity levels for lint diagnostics */
export type LintSeverity = "error" | "warning" | "info";

/** A lint target category */
export type LintTarget = "skill" | "agent" | "instruction";

/** A single lint diagnostic */
export interface LintDiagnostic {
    readonly filePath: string;
    readonly line: number;
    readonly column?: number;
    readonly endLine?: number;
    readonly endColumn?: number;
    readonly severity: LintSeverity;
    readonly message: string;
    readonly ruleId?: string;
    readonly field?: string;
    readonly target: LintTarget;
}

/** Aggregated result from a lint run */
export interface LintOutput {
    readonly diagnostics: readonly LintDiagnostic[];
    readonly target: LintTarget;
    readonly filesAnalyzed: readonly string[];
    readonly summary: {
        readonly totalFiles: number;
        readonly totalErrors: number;
        readonly totalWarnings: number;
        readonly totalInfos: number;
    };
}
