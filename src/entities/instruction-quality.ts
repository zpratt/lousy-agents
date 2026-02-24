/**
 * Core domain entities for instruction quality analysis.
 * Defines quality scoring types, dimension definitions, and discovered instruction file types.
 */

/** Classification of instruction file formats */
export type InstructionFileFormat =
    | "copilot-instructions"
    | "copilot-scoped"
    | "copilot-agent"
    | "agents-md"
    | "claude-md";

/** A discovered instruction file */
export interface DiscoveredInstructionFile {
    readonly filePath: string;
    readonly format: InstructionFileFormat;
}

/** Quality scores for a single command across three dimensions */
export interface CommandQualityScores {
    readonly commandName: string;
    /** 1 if command is under a matched heading, 0 otherwise */
    readonly structuralContext: number;
    /** 1 if command is in a code block or inline code, 0 otherwise */
    readonly executionClarity: number;
    /** 1 if conditional keywords found near the code block, 0 otherwise */
    readonly loopCompleteness: number;
    /** Average of the three dimension scores, rounded to two decimal places */
    readonly compositeScore: number;
    /** File where the best score was found */
    readonly bestSourceFile: string;
}

/** Result of analyzing instruction quality for a repository */
export interface InstructionQualityResult {
    readonly discoveredFiles: readonly DiscoveredInstructionFile[];
    readonly commandScores: readonly CommandQualityScores[];
    readonly overallQualityScore: number;
    readonly suggestions: readonly string[];
    readonly parsingErrors: readonly ParsingError[];
}

/** A file that failed to parse */
export interface ParsingError {
    readonly filePath: string;
    readonly error: string;
}

/** Default heading patterns that indicate feedback loop sections */
export const DEFAULT_STRUCTURAL_HEADING_PATTERNS = [
    "Validation",
    "Verification",
    "Feedback Loop",
    "Mandatory",
    "Before Commit",
    "Validation Suite",
    "Commands",
] as const;

/** Conditional keywords indicating error handling near code blocks */
export const CONDITIONAL_KEYWORDS = [
    "if",
    "fail",
    "fails",
    "failure",
    "error",
    "retry",
    "revert",
    "fix",
    "resolve",
    "broken",
    "red",
] as const;
