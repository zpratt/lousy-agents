/**
 * @lousy-agents/lint — Public Lint API
 *
 * Provides a programmatic lint interface for validating agent skills,
 * custom agents, hook configurations, and instruction files.
 *
 * @example
 * ```typescript
 * import { runLint, createFormatter } from '@lousy-agents/lint';
 *
 * const result = await runLint({ directory: '/path/to/project' });
 * if (result.hasErrors) {
 *   const formatter = createFormatter('json');
 *   console.error(formatter.format(result.outputs));
 * }
 * ```
 */

export type {
    CommandQualityScores,
    DiscoveredInstructionFile,
    InstructionFileFormat,
    InstructionQualityResult,
    InstructionSuggestion,
    ParsingError,
} from "@lousy-agents/core/entities/instruction-quality.js";

export type {
    LintDiagnostic,
    LintOutput,
    LintSeverity,
    LintTarget,
} from "@lousy-agents/core/entities/lint.js";

export type {
    LintRulesConfig,
    RuleConfigMap,
    RuleSeverityConfig,
} from "@lousy-agents/core/entities/lint-rules.js";
export { DEFAULT_LINT_RULES } from "@lousy-agents/core/entities/lint-rules.js";
export type {
    LintFormatType,
    LintFormatter,
} from "@lousy-agents/core/formatters/index.js";

export { createFormatter } from "@lousy-agents/core/formatters/index.js";
export type { LintLogger, LintOptions, LintResult } from "./lint.js";
export { runLint } from "./lint.js";

export { LintValidationError } from "./lint-errors.js";
