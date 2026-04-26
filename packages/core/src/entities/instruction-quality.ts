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

/** A structured suggestion with an optional rule ID for filtering */
export interface InstructionSuggestion {
    readonly message: string;
    readonly ruleId?: string;
}

/** Result of analyzing instruction quality for a repository */
export interface InstructionQualityResult {
    readonly discoveredFiles: readonly DiscoveredInstructionFile[];
    readonly commandScores: readonly CommandQualityScores[];
    readonly overallQualityScore: number;
    readonly suggestions: readonly InstructionSuggestion[];
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

/**
 * Descriptions for each default structural heading pattern explaining why it is recommended.
 * Used to generate informative warnings when a heading is missing from an instruction file.
 */
export const HEADING_PATTERN_DESCRIPTIONS: ReadonlyMap<string, string> =
    new Map([
        [
            "Validation",
            "Agents need this section to understand how to validate their changes meet quality standards.",
        ],
        [
            "Verification",
            "Agents need this section to understand how to verify their implementation is correct.",
        ],
        [
            "Feedback Loop",
            "Agents need this section to understand the iterative improvement process to follow.",
        ],
        [
            "Mandatory",
            "Agents need this section to understand which steps are required and cannot be skipped.",
        ],
        [
            "Before Commit",
            "Agents need this section to know what checks to run before committing changes.",
        ],
        [
            "Validation Suite",
            "Agents need this section to know which validation commands to run against the codebase.",
        ],
        [
            "Commands",
            "Agents need this section to know which commands and tools are available in the project.",
        ],
    ]);

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
