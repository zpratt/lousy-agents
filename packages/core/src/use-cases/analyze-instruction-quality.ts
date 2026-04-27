/**
 * Use case for analyzing instruction quality across a repository.
 * Orchestrates discovery, AST parsing, and scoring of feedback loop documentation.
 */

import { z } from "zod";
import type {
    CommandQualityScores,
    DiscoveredInstructionFile,
    InstructionQualityResult,
    InstructionSuggestion,
    ParsingError,
} from "../entities/instruction-quality.js";
import {
    CONDITIONAL_KEYWORDS,
    DEFAULT_STRUCTURAL_HEADING_PATTERNS,
    HEADING_PATTERN_DESCRIPTIONS,
} from "../entities/instruction-quality.js";
import type { LintDiagnostic } from "../entities/lint.js";

/**
 * A heading node with its depth and text content.
 * Port type for markdown structure.
 */
export interface MarkdownHeading {
    readonly text: string;
    readonly depth: number;
    readonly position: { readonly line: number };
}

/**
 * A code block node.
 * Port type for markdown structure.
 */
export interface MarkdownCodeBlock {
    readonly value: string;
    readonly lang?: string;
    readonly position: { readonly line: number };
    readonly nodeIndex: number;
}

/**
 * An inline code node.
 * Port type for markdown structure.
 */
export interface MarkdownInlineCode {
    readonly value: string;
    readonly position: { readonly line: number };
}

/**
 * Extracted structural features from a Markdown file.
 * Port type for use case dependencies.
 */
export interface MarkdownStructure {
    readonly headings: readonly MarkdownHeading[];
    readonly codeBlocks: readonly MarkdownCodeBlock[];
    readonly inlineCodes: readonly MarkdownInlineCode[];
    readonly ast: { readonly children: readonly unknown[] };
}

/**
 * Port for Markdown AST operations.
 */
export interface MarkdownAstGateway {
    parseFile(filePath: string): Promise<MarkdownStructure>;
    parseContent(content: string): MarkdownStructure;
    /**
     * Checks if text in sibling nodes within a proximity window contains conditional keywords.
     * Note: Performance is bounded by the CONDITIONAL_KEYWORDS constant size (~11 keywords)
     * and proximityWindow (default 3 nodes), not by document size.
     */
    findConditionalKeywordsInProximity(
        structure: MarkdownStructure,
        codeBlockNodeIndex: number,
        proximityWindow: number,
        keywords: readonly string[],
    ): boolean;
}

/**
 * Port for discovering instruction files.
 */
export interface InstructionFileDiscoveryGateway {
    discoverInstructionFiles(
        targetDir: string,
    ): Promise<DiscoveredInstructionFile[]>;
}

/**
 * Port for discovering mandatory feedback loop commands.
 */
export interface FeedbackLoopCommandsGateway {
    getMandatoryCommands(targetDir: string): Promise<string[]>;
}

/** Maximum number of raw heading pattern entries accepted before deduplication. */
const MAX_RAW_HEADING_PATTERNS = 1000;

/** Maximum number of heading patterns accepted in a single execute() call. */
const MAX_HEADING_PATTERNS = 50;

/** Maximum character length for a single heading pattern. */
const MAX_PATTERN_LENGTH = 200;

/**
 * Input for the analyze instruction quality use case.
 */
const AnalyzeInstructionQualityInputSchema = z.object({
    targetDir: z.string().min(1),
    headingPatterns: z
        .array(z.string())
        .max(MAX_RAW_HEADING_PATTERNS)
        .optional(),
    proximityWindow: z.number().int().positive().optional(),
});

export type AnalyzeInstructionQualityInput = z.infer<
    typeof AnalyzeInstructionQualityInputSchema
>;

/**
 * Output from the analyze instruction quality use case.
 */
export interface AnalyzeInstructionQualityOutput {
    result: InstructionQualityResult;
    diagnostics: LintDiagnostic[];
}

/** Per-file analysis for a single command */
interface CommandFileAnalysis {
    structuralContext: number;
    executionClarity: number;
    loopCompleteness: number;
    sourceFile: string;
}

/**
 * Use case for analyzing instruction quality.
 */
export class AnalyzeInstructionQualityUseCase {
    constructor(
        private readonly discoveryGateway: InstructionFileDiscoveryGateway,
        private readonly astGateway: MarkdownAstGateway,
        private readonly commandsGateway: FeedbackLoopCommandsGateway,
    ) {}

    /**
     * Returns true if the given heading-pattern string contains any characters
     * that could cause terminal injection or garbled output when the pattern
     * is embedded in a diagnostic message.
     *
     * Rejects: ASCII C0 (0x00–0x1F), DEL (0x7F), C1 (0x80–0x9F), **lone**
     * Unicode surrogates (U+D800–U+DFFF — but valid surrogate pairs like emoji
     * are accepted), line/paragraph separators (U+2028–U+2029), and bidi
     * override characters (U+202A–U+202E, U+2066–U+2069).
     */
    private static patternHasControlCharacters(value: string): boolean {
        for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i);
            if (code <= 0x1f) return true;
            if (code === 0x7f) return true;
            if (code >= 0x80 && code <= 0x9f) return true;
            // Detect lone surrogates only; valid surrogate pairs (e.g., emoji)
            // should be accepted. A high surrogate (0xD800–0xDBFF) is lone if
            // it is not immediately followed by a low surrogate (0xDC00–0xDFFF).
            if (code >= 0xd800 && code <= 0xdbff) {
                const next = value.charCodeAt(i + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    i++; // valid pair — skip the low surrogate
                } else {
                    return true; // lone high surrogate
                }
            } else if (code >= 0xdc00 && code <= 0xdfff) {
                return true; // lone low surrogate
            }
            if (code === 0x2028 || code === 0x2029) return true;
            if (code >= 0x202a && code <= 0x202e) return true;
            if (code >= 0x2066 && code <= 0x2069) return true;
        }
        return false;
    }

    /**
     * Serializes a heading pattern for safe inclusion in error messages,
     * escaping every code unit outside the printable ASCII range (0x20–0x7E)
     * to a \uXXXX sequence. This prevents terminal injection via bidi override
     * characters and other non-printable code points that JSON.stringify does
     * not escape.
     */
    private static serializePatternForError(value: string): string {
        let result = '"';
        for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i);
            if (code >= 0x20 && code <= 0x7e) {
                result += value[i];
            } else {
                result += `\\u${code.toString(16).padStart(4, "0")}`;
            }
        }
        return `${result}"`;
    }

    async execute(
        input: AnalyzeInstructionQualityInput,
    ): Promise<AnalyzeInstructionQualityOutput> {
        const parsed = AnalyzeInstructionQualityInputSchema.parse(input);

        const seenLower = new Set<string>();
        const headingPatterns: string[] = [];

        for (const raw of parsed.headingPatterns ?? [
            ...DEFAULT_STRUCTURAL_HEADING_PATTERNS,
        ]) {
            // Validate BEFORE trim() — U+2028/U+2029 are JavaScript whitespace
            // and would be silently stripped by trim(), bypassing the check.
            // Filter before transform.
            if (
                AnalyzeInstructionQualityUseCase.patternHasControlCharacters(
                    raw,
                )
            ) {
                throw new Error(
                    `headingPatterns must not contain control characters, bidi override characters, or lone surrogate code points: ${AnalyzeInstructionQualityUseCase.serializePatternForError(raw)}`,
                );
            }
            const trimmed = raw.trim();
            if (trimmed.length === 0) {
                throw new Error(
                    "headingPatterns must not contain empty or whitespace-only entries",
                );
            }
            if (trimmed.length > MAX_PATTERN_LENGTH) {
                throw new Error(
                    `headingPatterns entries must not exceed ${MAX_PATTERN_LENGTH} characters`,
                );
            }
            const lower = trimmed.toLowerCase();
            if (!seenLower.has(lower)) {
                seenLower.add(lower);
                headingPatterns.push(trimmed);
            }
        }

        if (headingPatterns.length > MAX_HEADING_PATTERNS) {
            throw new Error(
                `headingPatterns must contain at most ${MAX_HEADING_PATTERNS} entries (got ${headingPatterns.length})`,
            );
        }

        const proximityWindow = parsed.proximityWindow ?? 3;

        const discoveredFiles =
            await this.discoveryGateway.discoverInstructionFiles(
                parsed.targetDir,
            );

        const mandatoryCommands =
            await this.commandsGateway.getMandatoryCommands(parsed.targetDir);

        if (discoveredFiles.length === 0) {
            return {
                result: {
                    discoveredFiles: [],
                    commandScores: [],
                    overallQualityScore: 0,
                    suggestions: [
                        {
                            message:
                                "No agent instruction files found. Supported formats: .github/copilot-instructions.md, .github/instructions/*.md, .github/agents/*.md, AGENTS.md, CLAUDE.md",
                        },
                    ],
                    parsingErrors: [],
                },
                diagnostics: [],
            };
        }

        // Analyze each file
        const fileStructures = new Map<string, MarkdownStructure>();
        const parsingErrors: ParsingError[] = [];
        for (const file of discoveredFiles) {
            try {
                const structure = await this.astGateway.parseFile(
                    file.filePath,
                );
                fileStructures.set(file.filePath, structure);
            } catch (error) {
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : "Unknown parsing error";
                parsingErrors.push({
                    filePath: file.filePath,
                    error: errorMessage,
                });
            }
        }

        // Sort parsing errors for deterministic output
        parsingErrors.sort((a, b) =>
            a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0,
        );

        // Score each mandatory command across all files
        const commandScores: CommandQualityScores[] = [];
        const diagnostics: LintDiagnostic[] = [];

        // Emit diagnostics for parsing errors
        for (const pe of parsingErrors) {
            diagnostics.push({
                filePath: pe.filePath,
                line: 1,
                severity: "warning",
                message: `Failed to parse file: ${pe.error}`,
                ruleId: "instruction/parse-error",
                target: "instruction",
            });
        }

        // Check each successfully parsed file for missing structural headings
        const sortedFilePaths = Array.from(fileStructures.keys()).sort(
            (a, b) => (a < b ? -1 : a > b ? 1 : 0),
        );
        for (const filePath of sortedFilePaths) {
            const structure = fileStructures.get(filePath);
            if (!structure) {
                continue;
            }
            const missingDiagnostics = this.checkMissingHeadings(
                filePath,
                structure,
                headingPatterns,
            );
            diagnostics.push(...missingDiagnostics);
        }

        for (const command of mandatoryCommands) {
            const bestAnalysis = this.findBestScore(
                command,
                discoveredFiles,
                fileStructures,
                headingPatterns,
                proximityWindow,
                diagnostics,
            );

            if (bestAnalysis) {
                const composite =
                    Math.round(
                        ((bestAnalysis.structuralContext +
                            bestAnalysis.executionClarity +
                            bestAnalysis.loopCompleteness) /
                            3) *
                            100,
                    ) / 100;

                commandScores.push({
                    commandName: command,
                    structuralContext: bestAnalysis.structuralContext,
                    executionClarity: bestAnalysis.executionClarity,
                    loopCompleteness: bestAnalysis.loopCompleteness,
                    compositeScore: composite,
                    bestSourceFile: bestAnalysis.sourceFile,
                });
            } else {
                commandScores.push({
                    commandName: command,
                    structuralContext: 0,
                    executionClarity: 0,
                    loopCompleteness: 0,
                    compositeScore: 0,
                    bestSourceFile: "",
                });
            }
        }

        // Overall quality score
        const overallQualityScore =
            commandScores.length > 0
                ? Math.round(
                      (commandScores.reduce(
                          (sum, s) => sum + s.compositeScore,
                          0,
                      ) /
                          commandScores.length) *
                          100,
                  )
                : 0;

        // Generate suggestions
        const suggestions = this.generateSuggestions(commandScores);

        if (parsingErrors.length > 0) {
            const skippedFiles = parsingErrors
                .map((pe) => pe.filePath)
                .join(", ");
            suggestions.push({
                message: `${parsingErrors.length} file(s) could not be parsed and were skipped: ${skippedFiles}. Analysis may be incomplete.`,
                ruleId: "instruction/parse-error",
            });
        }

        return {
            result: {
                discoveredFiles,
                commandScores,
                overallQualityScore,
                suggestions,
                parsingErrors,
            },
            diagnostics,
        };
    }

    private findBestScore(
        command: string,
        discoveredFiles: readonly DiscoveredInstructionFile[],
        fileStructures: Map<string, MarkdownStructure>,
        headingPatterns: string[],
        proximityWindow: number,
        diagnostics: LintDiagnostic[],
    ): CommandFileAnalysis | null {
        let bestAnalysis: CommandFileAnalysis | null = null;
        let bestComposite = -1;

        for (const file of discoveredFiles) {
            const structure = fileStructures.get(file.filePath);
            if (!structure) {
                continue;
            }

            const analysis = this.analyzeCommandInFile(
                command,
                file,
                structure,
                headingPatterns,
                proximityWindow,
                diagnostics,
            );

            if (!analysis) {
                continue;
            }

            const composite =
                analysis.structuralContext +
                analysis.executionClarity +
                analysis.loopCompleteness;

            if (composite > bestComposite) {
                bestComposite = composite;
                bestAnalysis = analysis;
            }
        }

        return bestAnalysis;
    }

    private analyzeCommandInFile(
        command: string,
        file: DiscoveredInstructionFile,
        structure: MarkdownStructure,
        headingPatterns: string[],
        proximityWindow: number,
        diagnostics: LintDiagnostic[],
    ): CommandFileAnalysis | null {
        // Check if command appears in the file at all
        const inCodeBlock = this.isCommandInCodeBlock(command, structure);
        const inInlineCode = this.isCommandInInlineCode(command, structure);
        const inPlainText = this.isCommandInPlainText(command, structure);

        if (!inCodeBlock && !inInlineCode && !inPlainText) {
            return null;
        }

        // Execution clarity: 1 if in code block or inline code, 0 otherwise
        const executionClarity = inCodeBlock || inInlineCode ? 1 : 0;

        if (executionClarity === 0) {
            diagnostics.push({
                filePath: file.filePath,
                line: 1,
                severity: "warning",
                message: `Command '${command}' appears only in prose, not in a code block`,
                ruleId: "instruction/command-not-in-code-block",
                target: "instruction",
            });
        }

        // Structural context: 1 if under a matched heading, 0 otherwise
        const structuralContext = this.isCommandUnderMatchedHeading(
            command,
            structure,
            headingPatterns,
        )
            ? 1
            : 0;

        if (structuralContext === 0) {
            diagnostics.push({
                filePath: file.filePath,
                line: 1,
                severity: "warning",
                message: `Command '${command}' is not under a dedicated feedback loop section`,
                ruleId: "instruction/command-outside-section",
                target: "instruction",
            });
        }

        // Loop completeness: only check if in a fenced code block
        let loopCompleteness = 0;
        if (inCodeBlock) {
            loopCompleteness = this.hasConditionalKeywordsNearCommand(
                command,
                structure,
                proximityWindow,
            )
                ? 1
                : 0;

            if (loopCompleteness === 0) {
                diagnostics.push({
                    filePath: file.filePath,
                    line: 1,
                    severity: "warning",
                    message: `Command '${command}' has no error handling guidance following its code block`,
                    ruleId: "instruction/missing-error-handling",
                    target: "instruction",
                });
            }
        } else if (inInlineCode) {
            diagnostics.push({
                filePath: file.filePath,
                line: 1,
                severity: "warning",
                message: `Command '${command}' appears in inline code but not in a fenced code block; cannot assess error handling`,
                ruleId: "instruction/missing-error-handling",
                target: "instruction",
            });
        } else {
            diagnostics.push({
                filePath: file.filePath,
                line: 1,
                severity: "warning",
                message: `Command '${command}' has no error handling guidance (not in a code block)`,
                ruleId: "instruction/missing-error-handling",
                target: "instruction",
            });
        }

        return {
            structuralContext,
            executionClarity,
            loopCompleteness,
            sourceFile: file.filePath,
        };
    }

    private isCommandInCodeBlock(
        command: string,
        structure: MarkdownStructure,
    ): boolean {
        return structure.codeBlocks.some((block) =>
            block.value.includes(command),
        );
    }

    private isCommandInInlineCode(
        command: string,
        structure: MarkdownStructure,
    ): boolean {
        return structure.inlineCodes.some((code) =>
            code.value.includes(command),
        );
    }

    private isCommandInPlainText(
        command: string,
        structure: MarkdownStructure,
    ): boolean {
        // Check if any heading or paragraph text contains the command
        const fullText = this.extractFullText(structure);
        return fullText.includes(command);
    }

    private extractFullText(structure: MarkdownStructure): string {
        const parts: string[] = [];
        for (const heading of structure.headings) {
            parts.push(heading.text);
        }

        // Extract text from code blocks and inline codes
        for (const block of structure.codeBlocks) {
            parts.push(block.value);
        }
        for (const code of structure.inlineCodes) {
            parts.push(code.value);
        }

        // Use AST to extract paragraph text
        if (structure.ast.children) {
            for (const child of structure.ast.children) {
                this.collectText(child, parts);
            }
        }

        return parts.join(" ");
    }

    private collectText(
        node: { type: string; children?: unknown[]; value?: string },
        parts: string[],
    ): void {
        if (node.type === "text" && typeof node.value === "string") {
            parts.push(node.value);
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                this.collectText(
                    child as {
                        type: string;
                        children?: unknown[];
                        value?: string;
                    },
                    parts,
                );
            }
        }
    }

    private isCommandUnderMatchedHeading(
        command: string,
        structure: MarkdownStructure,
        headingPatterns: string[],
    ): boolean {
        // Find headings that match any pattern
        const matchedHeadingIndices: number[] = [];
        for (let i = 0; i < structure.headings.length; i++) {
            const heading = structure.headings[i];
            const matches = headingPatterns.some((pattern) =>
                heading.text.toLowerCase().includes(pattern.toLowerCase()),
            );
            if (matches) {
                matchedHeadingIndices.push(i);
            }
        }

        if (matchedHeadingIndices.length === 0) {
            return false;
        }

        // Check if any code block containing the command falls under a matched heading
        for (const codeBlock of structure.codeBlocks) {
            if (!codeBlock.value.includes(command)) {
                continue;
            }

            const codeLine = codeBlock.position.line;

            for (const headingIdx of matchedHeadingIndices) {
                const heading = structure.headings[headingIdx];
                const headingLine = heading.position.line;

                if (codeLine <= headingLine) {
                    continue;
                }

                // Find the next heading of equal or higher level
                const nextHeading = structure.headings.find(
                    (h, idx) => idx > headingIdx && h.depth <= heading.depth,
                );

                if (!nextHeading || codeLine < nextHeading.position.line) {
                    return true;
                }
            }
        }

        // Also check inline code and plain text under matched headings
        for (const inlineCode of structure.inlineCodes) {
            if (!inlineCode.value.includes(command)) {
                continue;
            }

            const codeLine = inlineCode.position.line;

            for (const headingIdx of matchedHeadingIndices) {
                const heading = structure.headings[headingIdx];
                const headingLine = heading.position.line;

                if (codeLine <= headingLine) {
                    continue;
                }

                const nextHeading = structure.headings.find(
                    (h, idx) => idx > headingIdx && h.depth <= heading.depth,
                );

                if (!nextHeading || codeLine < nextHeading.position.line) {
                    return true;
                }
            }
        }

        return false;
    }

    private hasConditionalKeywordsNearCommand(
        command: string,
        structure: MarkdownStructure,
        proximityWindow: number,
    ): boolean {
        for (const codeBlock of structure.codeBlocks) {
            if (!codeBlock.value.includes(command)) {
                continue;
            }

            if (
                this.astGateway.findConditionalKeywordsInProximity(
                    structure,
                    codeBlock.nodeIndex,
                    proximityWindow,
                    CONDITIONAL_KEYWORDS,
                )
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Emits a warning diagnostic for each heading pattern that is absent from the file.
     * Headings are matched case-insensitively using substring inclusion, matching the
     * same logic used elsewhere in the use case.
     */
    private checkMissingHeadings(
        filePath: string,
        structure: MarkdownStructure,
        headingPatterns: string[],
    ): LintDiagnostic[] {
        // Precondition: `headingPatterns` must already be deduplicated
        // (case-insensitively) and validated. This invariant is enforced by
        // `execute()` before calling this method.
        const diagnostics: LintDiagnostic[] = [];
        const fileHeadingTexts = structure.headings.map((h) =>
            h.text.toLowerCase(),
        );

        // Build a lowercase-keyed lookup for descriptions so the map remains valid
        // even when callers provide headingPatterns with non-canonical casing.
        const descriptionsByLower = new Map<string, string>();
        for (const [key, value] of HEADING_PATTERN_DESCRIPTIONS) {
            descriptionsByLower.set(key.toLowerCase(), value);
        }

        for (const pattern of headingPatterns) {
            const patternLower = pattern.toLowerCase();
            const hasHeading = fileHeadingTexts.some((text) => {
                if (!text.includes(patternLower)) {
                    return false;
                }
                // Don't let a heading satisfy a shorter pattern when it also satisfies
                // a longer, more-specific pattern that starts with the shorter one.
                // E.g., a "Validation Suite" heading satisfies "Validation Suite" but
                // should NOT also satisfy "Validation".
                const supersededByMoreSpecific = headingPatterns.some(
                    (other) =>
                        other !== pattern &&
                        other.toLowerCase().startsWith(patternLower) &&
                        text.includes(other.toLowerCase()),
                );
                return !supersededByMoreSpecific;
            });
            if (!hasHeading) {
                const description =
                    descriptionsByLower.get(patternLower) ??
                    "This heading helps guide coding agents through structured workflows.";
                diagnostics.push({
                    filePath,
                    line: 1,
                    severity: "warning",
                    message: `Missing '${pattern}' heading section. ${description}`,
                    ruleId: "instruction/missing-structural-heading",
                    target: "instruction",
                });
            }
        }

        return diagnostics;
    }

    private generateSuggestions(
        commandScores: readonly CommandQualityScores[],
    ): InstructionSuggestion[] {
        const suggestions: InstructionSuggestion[] = [];

        const lowStructural = commandScores.filter(
            (s) => s.structuralContext === 0 && s.bestSourceFile !== "",
        );
        if (lowStructural.length > 0) {
            const names = lowStructural.map((s) => s.commandName).join(", ");
            suggestions.push({
                message: `Commands not under a dedicated section: ${names}. Add a heading like "## Validation" or "## Feedback Loop" above these commands.`,
                ruleId: "instruction/command-outside-section",
            });
        }

        const lowExecution = commandScores.filter(
            (s) => s.executionClarity === 0 && s.bestSourceFile !== "",
        );
        if (lowExecution.length > 0) {
            const names = lowExecution.map((s) => s.commandName).join(", ");
            suggestions.push({
                message: `Commands not in code blocks: ${names}. Document these commands in fenced code blocks for clarity.`,
                ruleId: "instruction/command-not-in-code-block",
            });
        }

        const lowLoop = commandScores.filter(
            (s) =>
                s.loopCompleteness === 0 &&
                s.executionClarity === 1 &&
                s.bestSourceFile !== "",
        );
        if (lowLoop.length > 0) {
            const names = lowLoop.map((s) => s.commandName).join(", ");
            suggestions.push({
                message: `Commands missing error handling guidance: ${names}. Add instructions for what to do if the command fails.`,
                ruleId: "instruction/missing-error-handling",
            });
        }

        const notFound = commandScores.filter((s) => s.bestSourceFile === "");
        if (notFound.length > 0) {
            const names = notFound.map((s) => s.commandName).join(", ");
            suggestions.push({
                message: `Commands not found in any instruction file: ${names}. Document these feedback loop commands in your instruction files.`,
            });
        }

        return suggestions;
    }
}
