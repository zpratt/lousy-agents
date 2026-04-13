/**
 * @lousy-agents/core — Public API
 *
 * Provides a programmatic lint interface for validating agent skills,
 * custom agents, hook configurations, and instruction files.
 *
 * @example
 * ```typescript
 * import { runLint, createFormatter } from '@lousy-agents/core';
 *
 * const result = await runLint({ directory: '/path/to/project' });
 * if (result.hasErrors) {
 *   const formatter = createFormatter('json');
 *   console.error(formatter.format(result.outputs));
 * }
 * ```
 */

// ── Instruction quality result types (returned in LintOutput) ────────
export type {
    CommandQualityScores,
    DiscoveredInstructionFile,
    InstructionFileFormat,
    InstructionQualityResult,
    InstructionSuggestion,
} from "./entities/instruction-quality.js";
// ── Consumer-facing result types ─────────────────────────────────────
export type {
    LintDiagnostic,
    LintOutput,
    LintSeverity,
    LintTarget,
} from "./entities/lint.js";
// ── Lint rule configuration types (for advanced consumers) ───────────
export type {
    LintRulesConfig,
    RuleConfigMap,
    RuleSeverityConfig,
} from "./entities/lint-rules.js";
export { DEFAULT_LINT_RULES } from "./entities/lint-rules.js";
export type { LintFormatType, LintFormatter } from "./formatters/index.js";
// ── Output formatters ────────────────────────────────────────────────
export { createFormatter } from "./formatters/index.js";
export type { LintOptions, LintResult } from "./lint.js";
// ── Public lint API ──────────────────────────────────────────────────
export { runLint } from "./lint.js";
