/**
 * @lousy-agents/lint — Public Lint API type declarations
 *
 * Hand-authored declaration file that defines the public API contract
 * for 3rd-party consumers. This is the sole type surface exposed by
 * the package — internal architecture types are not leaked.
 */

// ── Lint severity and target ─────────────────────────────────────────

/** Severity levels for lint diagnostics. */
export type LintSeverity = "error" | "warning" | "info";

/** A lint target category. */
export type LintTarget = "skill" | "agent" | "instruction" | "hook";

// ── Diagnostics ──────────────────────────────────────────────────────

/** A single lint diagnostic produced during analysis. */
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

// ── Instruction quality types ────────────────────────────────────────

/** Classification of instruction file formats. */
export type InstructionFileFormat =
    | "copilot-instructions"
    | "copilot-scoped"
    | "copilot-agent"
    | "agents-md"
    | "claude-md";

/** A discovered instruction file. */
export interface DiscoveredInstructionFile {
    readonly filePath: string;
    readonly format: InstructionFileFormat;
}

/** Quality scores for a single command across three dimensions. */
export interface CommandQualityScores {
    readonly commandName: string;
    readonly structuralContext: number;
    readonly executionClarity: number;
    readonly loopCompleteness: number;
    readonly compositeScore: number;
    readonly bestSourceFile: string;
}

/** A structured suggestion with an optional rule ID for filtering. */
export interface InstructionSuggestion {
    readonly message: string;
    readonly ruleId?: string;
}

/** A file that failed to parse. */
export interface ParsingError {
    readonly filePath: string;
    readonly error: string;
}

/** Result of analyzing instruction quality for a repository. */
export interface InstructionQualityResult {
    readonly discoveredFiles: readonly DiscoveredInstructionFile[];
    readonly commandScores: readonly CommandQualityScores[];
    readonly overallQualityScore: number;
    readonly suggestions: readonly InstructionSuggestion[];
    readonly parsingErrors: readonly ParsingError[];
}

// ── Lint output ──────────────────────────────────────────────────────

/** Aggregated result from linting a single target. */
export interface LintOutput {
    readonly diagnostics: readonly LintDiagnostic[];
    readonly target: LintTarget;
    readonly filesAnalyzed: readonly string[];
    readonly qualityResult?: InstructionQualityResult;
    readonly summary: {
        readonly totalFiles: number;
        readonly totalErrors: number;
        readonly totalWarnings: number;
        readonly totalInfos: number;
    };
}

// ── Lint rule configuration ──────────────────────────────────────────

/** Valid severity values for rule configuration. */
export type RuleSeverityConfig = "error" | "warn" | "off";

/** A map of rule IDs to their configured severity. */
export type RuleConfigMap = Readonly<Record<string, RuleSeverityConfig>>;

/** Lint configuration organized by target. */
export interface LintRulesConfig {
    readonly agents: RuleConfigMap;
    readonly hooks: RuleConfigMap;
    readonly instructions: RuleConfigMap;
    readonly skills: RuleConfigMap;
}

/** Default severity levels for all known lint rules. */
export declare const DEFAULT_LINT_RULES: LintRulesConfig;

// ── Lint options and result ──────────────────────────────────────────

/**
 * Options for the public lint API.
 *
 * @property directory - Path to the project directory to lint.
 * @property targets - Optional selection of which lint targets to run.
 *   When omitted or when all flags are false, all targets are linted.
 */
export interface LintOptions {
    readonly directory: string;
    readonly targets?: {
        readonly skills?: boolean;
        readonly agents?: boolean;
        readonly hooks?: boolean;
        readonly instructions?: boolean;
    };
}

/**
 * Result of a lint run.
 *
 * @property outputs - Array of lint results, one per target that was run.
 * @property hasErrors - True if any target produced error-severity diagnostics.
 */
export interface LintResult {
    readonly outputs: readonly LintOutput[];
    readonly hasErrors: boolean;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Run lint checks on a project directory.
 *
 * Orchestrates all lint targets (skills, agents, hooks, instructions),
 * applies lint rule configuration, and returns structured results.
 *
 * When no targets are specified (or all are false), all targets are run.
 *
 * @example
 * ```typescript
 * import { runLint } from '@lousy-agents/lint';
 *
 * const result = await runLint({ directory: '/path/to/project' });
 * console.log(result.hasErrors);
 * console.log(result.outputs);
 * ```
 *
 * @throws {Error} If directory is empty, contains path traversal, does not exist, or is not a directory.
 * @throws {Error} If lint configuration file has syntax errors or validation failures.
 */
export declare function runLint(options: LintOptions): Promise<LintResult>;

// ── Output formatters ────────────────────────────────────────────────

/** Supported output format values. */
export type LintFormatType = "human" | "json" | "rdjsonl";

/** A formatter that renders lint outputs to a string. */
export interface LintFormatter {
    format(outputs: LintOutput[]): string;
}

/**
 * Creates a formatter based on the specified format type.
 */
export declare function createFormatter(format: LintFormatType): LintFormatter;
