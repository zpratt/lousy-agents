/**
 * Use case for analyzing instruction quality across a repository.
 * Orchestrates discovery, AST parsing, and scoring of feedback loop documentation.
 */

import type {
    CommandQualityScores,
    DiscoveredInstructionFile,
    InstructionQualityResult,
    ParsingError,
} from "../entities/instruction-quality.js";
import {
    CONDITIONAL_KEYWORDS,
    DEFAULT_STRUCTURAL_HEADING_PATTERNS,
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

/**
 * Input for the analyze instruction quality use case.
 */
export interface AnalyzeInstructionQualityInput {
    targetDir: string;
    headingPatterns?: string[];
    proximityWindow?: number;
}

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

    async execute(
        input: AnalyzeInstructionQualityInput,
    ): Promise<AnalyzeInstructionQualityOutput> {
        if (!input.targetDir) {
            throw new Error("Target directory is required");
        }

        const headingPatterns = input.headingPatterns ?? [
            ...DEFAULT_STRUCTURAL_HEADING_PATTERNS,
        ];
        const proximityWindow = input.proximityWindow ?? 3;

        const discoveredFiles =
            await this.discoveryGateway.discoverInstructionFiles(
                input.targetDir,
            );

        const mandatoryCommands =
            await this.commandsGateway.getMandatoryCommands(input.targetDir);

        if (discoveredFiles.length === 0) {
            return {
                result: {
                    discoveredFiles: [],
                    commandScores: [],
                    overallQualityScore: 0,
                    suggestions: [
                        "No agent instruction files found. Supported formats: .github/copilot-instructions.md, .github/instructions/*.md, .github/agents/*.md, AGENTS.md, CLAUDE.md",
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
        parsingErrors.sort((a, b) => a.filePath.localeCompare(b.filePath));

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
            suggestions.push(
                `${parsingErrors.length} file(s) could not be parsed and were skipped: ${skippedFiles}. Analysis may be incomplete.`,
            );
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

    private generateSuggestions(
        commandScores: readonly CommandQualityScores[],
    ): string[] {
        const suggestions: string[] = [];

        const lowStructural = commandScores.filter(
            (s) => s.structuralContext === 0 && s.bestSourceFile !== "",
        );
        if (lowStructural.length > 0) {
            const names = lowStructural.map((s) => s.commandName).join(", ");
            suggestions.push(
                `Commands not under a dedicated section: ${names}. Add a heading like "## Validation" or "## Feedback Loop" above these commands.`,
            );
        }

        const lowExecution = commandScores.filter(
            (s) => s.executionClarity === 0 && s.bestSourceFile !== "",
        );
        if (lowExecution.length > 0) {
            const names = lowExecution.map((s) => s.commandName).join(", ");
            suggestions.push(
                `Commands not in code blocks: ${names}. Document these commands in fenced code blocks for clarity.`,
            );
        }

        const lowLoop = commandScores.filter(
            (s) =>
                s.loopCompleteness === 0 &&
                s.executionClarity === 1 &&
                s.bestSourceFile !== "",
        );
        if (lowLoop.length > 0) {
            const names = lowLoop.map((s) => s.commandName).join(", ");
            suggestions.push(
                `Commands missing error handling guidance: ${names}. Add instructions for what to do if the command fails.`,
            );
        }

        const notFound = commandScores.filter((s) => s.bestSourceFile === "");
        if (notFound.length > 0) {
            const names = notFound.map((s) => s.commandName).join(", ");
            suggestions.push(
                `Commands not found in any instruction file: ${names}. Document these feedback loop commands in your instruction files.`,
            );
        }

        return suggestions;
    }
}
