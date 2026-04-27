import Chance from "chance";
import type { Root } from "mdast";
import { describe, expect, it, vi } from "vitest";
import {
    DEFAULT_STRUCTURAL_HEADING_PATTERNS,
    type DiscoveredInstructionFile,
} from "../entities/instruction-quality.js";
import type { InstructionFileDiscoveryGateway } from "../gateways/instruction-file-discovery-gateway.js";
import type {
    MarkdownAstGateway,
    MarkdownStructure,
} from "../gateways/markdown-ast-gateway.js";
import {
    AnalyzeInstructionQualityUseCase,
    type FeedbackLoopCommandsGateway,
} from "./analyze-instruction-quality.js";

const chance = new Chance();

function createMockDiscoveryGateway(
    files: DiscoveredInstructionFile[] = [],
): InstructionFileDiscoveryGateway {
    return {
        discoverInstructionFiles: vi.fn().mockResolvedValue(files),
    };
}

function createMockAstGateway(
    structures: Map<string, MarkdownStructure> = new Map(),
    keywordResults: Map<number, boolean> = new Map(),
): MarkdownAstGateway {
    return {
        parseFile: vi.fn().mockImplementation((filePath: string) => {
            const structure = structures.get(filePath);
            if (!structure) {
                throw new Error(`No structure for ${filePath}`);
            }
            return Promise.resolve(structure);
        }),
        parseContent: vi.fn().mockReturnValue({
            headings: [],
            codeBlocks: [],
            inlineCodes: [],
            ast: { type: "root", children: [] },
        }),
        findConditionalKeywordsInProximity: vi
            .fn()
            .mockImplementation(
                (_structure: MarkdownStructure, codeBlockNodeIndex: number) => {
                    return keywordResults.get(codeBlockNodeIndex) ?? false;
                },
            ),
    };
}

function createMockCommandsGateway(
    commands: string[] = [],
): FeedbackLoopCommandsGateway {
    return {
        getMandatoryCommands: vi.fn().mockResolvedValue(commands),
    };
}

describe("AnalyzeInstructionQualityUseCase", () => {
    describe("given no instruction files found", () => {
        it("should return quality score of 0 with a suggestion", async () => {
            // Arrange
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway(["test"]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const targetDir = chance.word();

            // Act
            const output = await useCase.execute({ targetDir });

            // Assert
            expect(output.result.overallQualityScore).toBe(0);
            expect(output.result.suggestions).toHaveLength(1);
            expect(output.result.suggestions[0].message).toContain(
                "No agent instruction files found",
            );
        });
    });

    describe("given an empty target directory", () => {
        it("should throw an error", async () => {
            // Arrange
            const discoveryGateway = createMockDiscoveryGateway();
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway();
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act & Assert
            await expect(useCase.execute({ targetDir: "" })).rejects.toThrow(
                /targetDir/,
            );
        });
    });

    describe("given an instruction file with a command in a code block under a matched heading with error handling", () => {
        it("should return quality score of 100", async () => {
            // Arrange
            const filePath = "/repo/.github/copilot-instructions.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "copilot-instructions" },
            ];

            const structure: MarkdownStructure = {
                headings: [
                    {
                        text: "Validation Suite",
                        depth: 2,
                        position: { line: 1 },
                    },
                ],
                codeBlocks: [
                    {
                        value: "npm test",
                        lang: "bash",
                        position: { line: 3 },
                        nodeIndex: 1,
                    },
                ],
                inlineCodes: [],
                ast: {
                    type: "root",
                    children: [
                        {
                            type: "heading",
                            depth: 2,
                            children: [
                                { type: "text", value: "Validation Suite" },
                            ],
                        },
                        {
                            type: "code",
                            value: "npm test",
                            lang: "bash",
                        },
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "If any tests fail, fix them before proceeding.",
                                },
                            ],
                        },
                    ],
                } as unknown as Root,
            };

            const structures = new Map([[filePath, structure]]);
            const keywordResults = new Map([[1, true]]);
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures, keywordResults);
            const commandsGateway = createMockCommandsGateway(["npm test"]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({
                targetDir: "/repo",
            });

            // Assert
            expect(output.result.overallQualityScore).toBe(100);
            expect(output.result.commandScores).toHaveLength(1);
            expect(output.result.commandScores[0].structuralContext).toBe(1);
            expect(output.result.commandScores[0].executionClarity).toBe(1);
            expect(output.result.commandScores[0].loopCompleteness).toBe(1);
            expect(output.result.commandScores[0].compositeScore).toBe(1);
        });
    });

    describe("given a command in prose only (no code block)", () => {
        it("should return executionClarity of 0", async () => {
            // Arrange
            const filePath = "/repo/CLAUDE.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "claude-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: {
                    type: "root",
                    children: [
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "Make sure you run npm test before committing.",
                                },
                            ],
                        },
                    ],
                } as unknown as Root,
            };

            const structures = new Map([[filePath, structure]]);
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures);
            const commandsGateway = createMockCommandsGateway(["npm test"]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(output.result.commandScores[0].executionClarity).toBe(0);
            expect(output.result.commandScores[0].loopCompleteness).toBe(0);
        });
    });

    describe("given a command in a code block without conditional keywords nearby", () => {
        it("should return loopCompleteness of 0", async () => {
            // Arrange
            const filePath = "/repo/.github/copilot-instructions.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "copilot-instructions" },
            ];

            const structure: MarkdownStructure = {
                headings: [
                    { text: "Commands", depth: 2, position: { line: 1 } },
                ],
                codeBlocks: [
                    {
                        value: "npm test",
                        lang: "bash",
                        position: { line: 3 },
                        nodeIndex: 1,
                    },
                ],
                inlineCodes: [],
                ast: {
                    type: "root",
                    children: [
                        {
                            type: "heading",
                            depth: 2,
                            children: [{ type: "text", value: "Commands" }],
                        },
                        {
                            type: "code",
                            value: "npm test",
                            lang: "bash",
                        },
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "Then run the build step.",
                                },
                            ],
                        },
                    ],
                } as unknown as Root,
            };

            const structures = new Map([[filePath, structure]]);
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures);
            const commandsGateway = createMockCommandsGateway(["npm test"]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(output.result.commandScores[0].executionClarity).toBe(1);
            expect(output.result.commandScores[0].loopCompleteness).toBe(0);
            expect(output.result.commandScores[0].structuralContext).toBe(1);
        });
    });

    describe("given a command in inline code but not in a fenced code block", () => {
        it("should return executionClarity of 1 and loopCompleteness of 0 with a diagnostic", async () => {
            // Arrange
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [
                    {
                        text: "Validation",
                        depth: 2,
                        position: { line: 1 },
                    },
                ],
                codeBlocks: [],
                inlineCodes: [
                    {
                        value: "npm test",
                        position: { line: 3 },
                    },
                ],
                ast: {
                    type: "root",
                    children: [
                        {
                            type: "heading",
                            depth: 2,
                            children: [{ type: "text", value: "Validation" }],
                        },
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "Run ",
                                },
                                {
                                    type: "inlineCode",
                                    value: "npm test",
                                },
                                {
                                    type: "text",
                                    value: " to verify.",
                                },
                            ],
                        },
                    ],
                } as unknown as Root,
            };

            const structures = new Map([[filePath, structure]]);
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures);
            const commandsGateway = createMockCommandsGateway(["npm test"]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(output.result.commandScores[0].executionClarity).toBe(1);
            expect(output.result.commandScores[0].loopCompleteness).toBe(0);
            expect(output.result.commandScores[0].structuralContext).toBe(1);
            const errorHandlingDiag = output.diagnostics.find(
                (d) =>
                    d.ruleId === "instruction/missing-error-handling" &&
                    d.message.includes("inline code"),
            );
            expect(errorHandlingDiag).toBeDefined();
        });
    });

    describe("given no mandatory commands discovered", () => {
        it("should return quality score of 0 with empty command scores", async () => {
            // Arrange
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: {
                    type: "root",
                    children: [],
                } as unknown as Root,
            };

            const structures = new Map([[filePath, structure]]);
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures);
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(output.result.overallQualityScore).toBe(0);
            expect(output.result.commandScores).toHaveLength(0);
            expect(output.result.discoveredFiles).toHaveLength(1);
        });
    });

    describe("given a file that fails to parse", () => {
        it("should skip the file and continue analyzing remaining files", async () => {
            // Arrange
            const goodFile = "/repo/AGENTS.md";
            const badFile = "/repo/CLAUDE.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath: badFile, format: "claude-md" },
                { filePath: goodFile, format: "agents-md" },
            ];

            const goodStructure: MarkdownStructure = {
                headings: [
                    {
                        text: "Validation",
                        depth: 2,
                        position: { line: 1 },
                    },
                ],
                codeBlocks: [
                    {
                        value: "npm test",
                        lang: "bash",
                        position: { line: 3 },
                        nodeIndex: 1,
                    },
                ],
                inlineCodes: [],
                ast: {
                    type: "root",
                    children: [
                        {
                            type: "heading",
                            depth: 2,
                            children: [{ type: "text", value: "Validation" }],
                        },
                        {
                            type: "code",
                            value: "npm test",
                            lang: "bash",
                        },
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "If tests fail, fix them.",
                                },
                            ],
                        },
                    ],
                } as unknown as Root,
            };

            const structures = new Map([[goodFile, goodStructure]]);
            const keywordResults = new Map([[1, true]]);
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures, keywordResults);
            const commandsGateway = createMockCommandsGateway(["npm test"]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert - should still analyze the good file
            expect(output.result.overallQualityScore).toBe(100);
            expect(output.result.commandScores[0].compositeScore).toBe(1);

            // Assert - should track parsing errors
            expect(output.result.parsingErrors).toHaveLength(1);
            expect(output.result.parsingErrors[0].filePath).toBe(badFile);
            expect(output.result.parsingErrors[0].error).toBeDefined();

            // Assert - should emit diagnostic for parse error
            const parseDiag = output.diagnostics.find(
                (d) => d.ruleId === "instruction/parse-error",
            );
            expect(parseDiag).toBeDefined();
            expect(parseDiag?.filePath).toBe(badFile);
            expect(parseDiag?.severity).toBe("warning");

            // Assert - should include suggestion about skipped files
            expect(
                output.result.suggestions.some((s) =>
                    s.message.includes("could not be parsed"),
                ),
            ).toBe(true);

            // Assert - files that fail to parse are excluded from missing-heading checks
            const missingHeadingForBadFile = output.diagnostics.filter(
                (d) =>
                    d.ruleId === "instruction/missing-structural-heading" &&
                    d.filePath === badFile,
            );
            expect(missingHeadingForBadFile).toHaveLength(0);
        });
    });

    describe("given a command not found in any instruction file", () => {
        it("should assign zero scores and include in suggestions", async () => {
            // Arrange
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: {
                    type: "root",
                    children: [
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "No relevant commands here.",
                                },
                            ],
                        },
                    ],
                } as unknown as Root,
            };

            const structures = new Map([[filePath, structure]]);
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures);
            const commandsGateway = createMockCommandsGateway([
                "npm test",
                "npm run build",
            ]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(output.result.commandScores).toHaveLength(2);
            for (const score of output.result.commandScores) {
                expect(score.compositeScore).toBe(0);
                expect(score.bestSourceFile).toBe("");
            }
            expect(output.result.overallQualityScore).toBe(0);
            expect(
                output.result.suggestions.some((s) =>
                    s.message.includes("not found in any instruction file"),
                ),
            ).toBe(true);
        });
    });

    describe("given commands with mixed quality across dimensions", () => {
        it("should generate suggestions for each dimension with deficient scores", async () => {
            // Arrange
            const filePath = "/repo/.github/copilot-instructions.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "copilot-instructions" },
            ];

            const structure: MarkdownStructure = {
                headings: [
                    {
                        text: "Validation",
                        depth: 2,
                        position: { line: 1 },
                    },
                ],
                codeBlocks: [
                    {
                        value: "npm test",
                        lang: "bash",
                        position: { line: 3 },
                        nodeIndex: 1,
                    },
                ],
                inlineCodes: [],
                ast: {
                    type: "root",
                    children: [
                        {
                            type: "heading",
                            depth: 2,
                            children: [{ type: "text", value: "Validation" }],
                        },
                        {
                            type: "code",
                            value: "npm test",
                            lang: "bash",
                        },
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "Then run the next step.",
                                },
                            ],
                        },
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "Make sure to run npm run build as well.",
                                },
                            ],
                        },
                    ],
                } as unknown as Root,
            };

            const structures = new Map([[filePath, structure]]);
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures);
            const commandsGateway = createMockCommandsGateway([
                "npm test",
                "npm run build",
            ]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert - npm test: structural=1, execution=1, loop=0 (no conditional keywords)
            const testScore = output.result.commandScores.find(
                (s) => s.commandName === "npm test",
            );
            expect(testScore?.structuralContext).toBe(1);
            expect(testScore?.executionClarity).toBe(1);
            expect(testScore?.loopCompleteness).toBe(0);

            // Assert - npm run build: in prose only
            const buildScore = output.result.commandScores.find(
                (s) => s.commandName === "npm run build",
            );
            expect(buildScore?.executionClarity).toBe(0);

            // Assert - suggestions should mention code blocks and error handling
            expect(
                output.result.suggestions.some((s) =>
                    s.message.includes("not in code blocks"),
                ),
            ).toBe(true);
            expect(
                output.result.suggestions.some((s) =>
                    s.message.includes("error handling guidance"),
                ),
            ).toBe(true);
        });
    });

    describe("given multiple instruction files", () => {
        it("should use the best score across files for each command", async () => {
            // Arrange
            const file1 = "/repo/.github/copilot-instructions.md";
            const file2 = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath: file1, format: "copilot-instructions" },
                { filePath: file2, format: "agents-md" },
            ];

            // File 1: command in prose (low quality)
            const structure1: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: {
                    type: "root",
                    children: [
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "Run npm test to check.",
                                },
                            ],
                        },
                    ],
                } as unknown as Root,
            };

            // File 2: command in code block under heading (high quality)
            const structure2: MarkdownStructure = {
                headings: [
                    {
                        text: "Validation",
                        depth: 2,
                        position: { line: 1 },
                    },
                ],
                codeBlocks: [
                    {
                        value: "npm test",
                        lang: "bash",
                        position: { line: 3 },
                        nodeIndex: 1,
                    },
                ],
                inlineCodes: [],
                ast: {
                    type: "root",
                    children: [
                        {
                            type: "heading",
                            depth: 2,
                            children: [{ type: "text", value: "Validation" }],
                        },
                        {
                            type: "code",
                            value: "npm test",
                            lang: "bash",
                        },
                        {
                            type: "paragraph",
                            children: [
                                {
                                    type: "text",
                                    value: "If tests fail, fix them.",
                                },
                            ],
                        },
                    ],
                } as unknown as Root,
            };

            const structures = new Map([
                [file1, structure1],
                [file2, structure2],
            ]);
            const keywordResults = new Map([[1, true]]);
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures, keywordResults);
            const commandsGateway = createMockCommandsGateway(["npm test"]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert - should use file2's better score
            expect(output.result.commandScores[0].structuralContext).toBe(1);
            expect(output.result.commandScores[0].executionClarity).toBe(1);
            expect(output.result.commandScores[0].bestSourceFile).toBe(file2);
        });
    });

    describe("given an instruction file missing all structural heading patterns", () => {
        it("emits a warning diagnostic for each missing heading pattern", async () => {
            // Arrange
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([[filePath, structure]]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert - one warning per missing heading pattern
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            expect(missingHeadingDiags).toHaveLength(
                DEFAULT_STRUCTURAL_HEADING_PATTERNS.length,
            );
            for (const pattern of DEFAULT_STRUCTURAL_HEADING_PATTERNS) {
                const diag = missingHeadingDiags.find((d) =>
                    d.message.includes(`'${pattern}'`),
                );
                expect(diag).toBeDefined();
                expect(diag?.severity).toBe("warning");
                expect(diag?.filePath).toBe(filePath);
                expect(diag?.line).toBe(1);
                expect(diag?.target).toBe("instruction");
            }
        });
    });

    describe("given an instruction file containing some but not all structural heading patterns", () => {
        it("emits warnings only for the missing headings", async () => {
            // Arrange
            const filePath = "/repo/CLAUDE.md";
            const presentHeadings = ["Commands", "Validation"];
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "claude-md" },
            ];

            const structure: MarkdownStructure = {
                headings: presentHeadings.map((text) => ({
                    text,
                    depth: 2,
                    position: { line: 1 },
                })),
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([[filePath, structure]]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert - warnings only for patterns not in presentHeadings
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            const expectedMissingCount =
                DEFAULT_STRUCTURAL_HEADING_PATTERNS.length -
                presentHeadings.length;
            expect(missingHeadingDiags).toHaveLength(expectedMissingCount);

            for (const pattern of presentHeadings) {
                const diag = missingHeadingDiags.find((d) =>
                    d.message.includes(`'${pattern}'`),
                );
                expect(diag).toBeUndefined();
            }
        });
    });

    describe("given an instruction file with all structural heading patterns present", () => {
        it("emits no missing-structural-heading diagnostics", async () => {
            // Arrange
            const filePath = "/repo/.github/copilot-instructions.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "copilot-instructions" },
            ];

            const structure: MarkdownStructure = {
                headings: DEFAULT_STRUCTURAL_HEADING_PATTERNS.map(
                    (text, i) => ({
                        text,
                        depth: 2,
                        position: { line: i * 10 + 1 },
                    }),
                ),
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([[filePath, structure]]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert - no missing-heading warnings
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            expect(missingHeadingDiags).toHaveLength(0);
        });
    });

    describe("given an instruction file where headings match patterns case-insensitively", () => {
        it("does not emit missing-heading warnings for case-variant matches", async () => {
            // Arrange
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [
                    { text: "VALIDATION", depth: 2, position: { line: 1 } },
                    { text: "commands", depth: 2, position: { line: 5 } },
                ],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([[filePath, structure]]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert - "Validation" and "Commands" should not trigger warnings
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            const hasValidationWarning = missingHeadingDiags.some((d) =>
                d.message.includes("'Validation'"),
            );
            const hasCommandsWarning = missingHeadingDiags.some((d) =>
                d.message.includes("'Commands'"),
            );
            expect(hasValidationWarning).toBe(false);
            expect(hasCommandsWarning).toBe(false);
        });
    });

    describe("given an instruction file with a heading message that includes the reason for the recommendation", () => {
        it("the warning message includes a description explaining why the heading is recommended", async () => {
            // Arrange
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([[filePath, structure]]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert - each warning message contains a description (more than just the heading name)
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            for (const diag of missingHeadingDiags) {
                expect(diag.message).toMatch(
                    /Missing '.+' heading section\. .+/,
                );
                // Ensure the message contains actionable guidance beyond just the heading name
                expect(diag.message.length).toBeGreaterThan(30);
            }
        });
    });

    describe("given an instruction file with only a 'Validation Suite' heading", () => {
        it("still emits a warning for the missing 'Validation' pattern", async () => {
            // Arrange - a heading "Validation Suite" should not also satisfy the "Validation" pattern
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [
                    {
                        text: "Validation Suite",
                        depth: 2,
                        position: { line: 1 },
                    },
                ],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([[filePath, structure]]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({ targetDir: "/repo" });

            // Assert - "Validation Suite" heading does NOT satisfy the "Validation" pattern
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            const hasValidationWarning = missingHeadingDiags.some((d) =>
                d.message.includes("'Validation'"),
            );
            expect(hasValidationWarning).toBe(true);

            // Assert - "Validation Suite" itself is satisfied
            const hasValidationSuiteWarning = missingHeadingDiags.some((d) =>
                d.message.includes("'Validation Suite'"),
            );
            expect(hasValidationSuiteWarning).toBe(false);
        });
    });

    describe("given duplicate heading patterns in the input", () => {
        it("emits each missing-heading diagnostic only once", async () => {
            // Arrange
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([[filePath, structure]]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act - pass the same pattern twice
            const output = await useCase.execute({
                targetDir: "/repo",
                headingPatterns: ["Commands", "Commands"],
            });

            // Assert - only one diagnostic is emitted for the duplicated pattern
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            expect(missingHeadingDiags).toHaveLength(1);
            expect(missingHeadingDiags[0].message).toContain("'Commands'");
        });
    });

    describe("given heading patterns with non-canonical casing", () => {
        it("still returns a specific description for known patterns", async () => {
            // Arrange
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];

            const structure: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([[filePath, structure]]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act - lowercase "commands" instead of the canonical "Commands"
            const output = await useCase.execute({
                targetDir: "/repo",
                headingPatterns: ["commands"],
            });

            // Assert - the message contains the specific description, not the generic fallback
            const diag = output.diagnostics.find(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            expect(diag).toBeDefined();
            expect(diag?.message).toContain(
                "Agents need this section to know which commands and tools are available in the project.",
            );
        });
    });

    describe("given multiple instruction files both missing structural heading patterns", () => {
        it("emits per-file diagnostics with the correct filePath for each file", async () => {
            // Arrange
            const filePathA = "/repo/AGENTS.md";
            const filePathB = "/repo/.github/copilot-instructions.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath: filePathA, format: "agents-md" },
                { filePath: filePathB, format: "copilot-instructions" },
            ];
            const emptyStructure = (): MarkdownStructure => ({
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            });

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([
                    [filePathA, emptyStructure()],
                    [filePathB, emptyStructure()],
                ]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const headingPatterns = ["Commands", "Validation"];

            // Act
            const output = await useCase.execute({
                targetDir: "/repo",
                headingPatterns,
            });

            // Assert - each file gets its own set of diagnostics
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            expect(missingHeadingDiags).toHaveLength(
                headingPatterns.length * files.length,
            );
            const diagsForFileA = missingHeadingDiags.filter(
                (d) => d.filePath === filePathA,
            );
            const diagsForFileB = missingHeadingDiags.filter(
                (d) => d.filePath === filePathB,
            );
            expect(diagsForFileA).toHaveLength(headingPatterns.length);
            expect(diagsForFileB).toHaveLength(headingPatterns.length);
        });

        it("does not emit diagnostics for a pattern that only the second file is missing", async () => {
            // Arrange — fileA has "Commands", fileB does not
            const filePathA = "/repo/AGENTS.md";
            const filePathB = "/repo/.github/copilot-instructions.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath: filePathA, format: "agents-md" },
                { filePath: filePathB, format: "copilot-instructions" },
            ];

            const structureWithCommands: MarkdownStructure = {
                headings: [
                    {
                        text: "Commands",
                        depth: 2,
                        position: { line: 1 },
                    },
                ],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };
            const emptyStructure: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([
                    [filePathA, structureWithCommands],
                    [filePathB, emptyStructure],
                ]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({
                targetDir: "/repo",
                headingPatterns: ["Commands"],
            });

            // Assert - only fileB gets a diagnostic
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            expect(missingHeadingDiags).toHaveLength(1);
            expect(missingHeadingDiags[0].filePath).toBe(filePathB);
        });
    });

    describe("given an empty headingPatterns array", () => {
        it("emits no missing-structural-heading diagnostics", async () => {
            // Arrange - empty array explicitly opts out of all heading checks
            const filePath = "/repo/AGENTS.md";
            const files: DiscoveredInstructionFile[] = [
                { filePath, format: "agents-md" },
            ];
            const structure: MarkdownStructure = {
                headings: [],
                codeBlocks: [],
                inlineCodes: [],
                ast: { type: "root", children: [] } as unknown as Root,
            };

            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(
                new Map([[filePath, structure]]),
            );
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const output = await useCase.execute({
                targetDir: "/repo",
                headingPatterns: [],
            });

            // Assert - no heading warnings (caller explicitly disabled all checks)
            const missingHeadingDiags = output.diagnostics.filter(
                (d) => d.ruleId === "instruction/missing-structural-heading",
            );
            expect(missingHeadingDiags).toHaveLength(0);
        });
    });

    describe("given an empty string heading pattern", () => {
        it("throws an error before performing any file I/O", async () => {
            // Arrange
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const validPattern = chance.word();

            // Act & Assert
            await expect(
                useCase.execute({
                    targetDir: "/repo",
                    headingPatterns: [validPattern, ""],
                }),
            ).rejects.toThrow(
                "headingPatterns must not contain empty or whitespace-only entries",
            );
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });
    });

    describe("given a whitespace-only heading pattern", () => {
        it("throws an error before performing any file I/O", async () => {
            // Arrange
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act & Assert
            await expect(
                useCase.execute({
                    targetDir: "/repo",
                    headingPatterns: ["   "],
                }),
            ).rejects.toThrow(
                "headingPatterns must not contain empty or whitespace-only entries",
            );
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });
    });

    describe("given a heading pattern containing control characters", () => {
        it("throws an error with a safely serialized pattern representation", async () => {
            // Arrange — ESC sequence that could inject ANSI codes into CLI output
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const word = chance.word();

            // Act
            const error = await useCase
                .execute({
                    targetDir: "/repo",
                    headingPatterns: [`\x1b[31m${word}\x1b[0m`],
                })
                .catch((e: unknown) => e);

            // Assert — static prefix and serialized ESC as \u001b (not raw bytes)
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain(
                "headingPatterns must not contain control characters, bidi override characters, or lone surrogate code points",
            );
            expect(message).toContain('"\\u001b');
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });

        it("should escape double quotes in the serialized error message when the pattern contains a control character and a double quote", async () => {
            // Arrange — pattern with control char AND embedded double quotes:
            // \x1b"quoted" — verifies the " → \" escaping path in serializePatternForError
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const error = await useCase
                .execute({
                    targetDir: "/repo",
                    headingPatterns: ['\x1b"quoted"'],
                })
                .catch((e: unknown) => e);

            // Assert — both \u001b (ESC) and \" (escaped quote) appear in message
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain('"\\u001b\\"quoted\\"');
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });

        it("should escape backslashes in the serialized error message when the pattern contains a control character and a backslash", async () => {
            // Arrange — pattern with control char AND embedded backslash:
            // \x1b\value — verifies the \ → \\ escaping path in serializePatternForError
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act
            const error = await useCase
                .execute({
                    targetDir: "/repo",
                    headingPatterns: ["\x1b\\value"],
                })
                .catch((e: unknown) => e);

            // Assert — \u001b (ESC) then \\ (escaped backslash) appear in message
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain('"\\u001b\\\\value');
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });
    });

    describe("given a heading pattern containing a lone Unicode surrogate", () => {
        it("throws an error naming surrogates before performing any file I/O", async () => {
            // Arrange — U+D800 (lone high surrogate) must be rejected to prevent
            // garbled diagnostic output in Node.js string rendering pipelines
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const word = chance.word();

            // Act
            const error = await useCase
                .execute({
                    targetDir: "/repo",
                    headingPatterns: [`\uD800${word}`],
                })
                .catch((e: unknown) => e);

            // Assert — lone high surrogate serialized as \ud800, not raw bytes
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain(
                "headingPatterns must not contain control characters, bidi override characters, or lone surrogate code points",
            );
            expect(message).toContain('"\\ud800');
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });

        it("rejects a lone low surrogate before performing any file I/O", async () => {
            // Arrange — U+DC00 (lone low surrogate) must also be rejected
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const word = chance.word();

            // Act
            const error = await useCase
                .execute({
                    targetDir: "/repo",
                    headingPatterns: [`${word}\uDC00`],
                })
                .catch((e: unknown) => e);

            // Assert — lone low surrogate serialized as \udc00, not raw bytes
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain(
                "headingPatterns must not contain control characters, bidi override characters, or lone surrogate code points",
            );
            expect(message).toContain('\\udc00"');
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });

        it("accepts a valid surrogate pair (emoji) in a heading pattern", async () => {
            // Arrange — 😀 = U+1F600 = \uD83D\uDE00 (valid surrogate pair)
            // should NOT be rejected as a control character
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );

            // Act & Assert — should not throw
            await expect(
                useCase.execute({
                    targetDir: "/repo",
                    headingPatterns: ["😀 Commands"],
                }),
            ).resolves.toBeDefined();
        });
    });

    describe("given a heading pattern containing a bidi override character", () => {
        it("throws an error before performing any file I/O", async () => {
            // Arrange — U+202A (LTR embedding) is a bidi override that can
            // spoof displayed text in terminal output
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const word = chance.word();

            // Act
            const error = await useCase
                .execute({
                    targetDir: "/repo",
                    headingPatterns: [`${word}\u202A${word}`],
                })
                .catch((e: unknown) => e);

            // Assert — bidi override serialized as \u202a, not embedded raw
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain(
                "headingPatterns must not contain control characters, bidi override characters, or lone surrogate code points",
            );
            expect(message).toContain("\\u202a");
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });
    });

    describe("given a heading pattern containing a line/paragraph separator", () => {
        it("throws an error before performing any file I/O", async () => {
            // Arrange — U+2028 (line separator) can break terminal rendering
            // and is not a printable character
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const word = chance.word();

            // Act
            const error = await useCase
                .execute({
                    targetDir: "/repo",
                    headingPatterns: [`${word}\u2028${word}`],
                })
                .catch((e: unknown) => e);

            // Assert — line separator serialized as \u2028, not embedded raw
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain(
                "headingPatterns must not contain control characters, bidi override characters, or lone surrogate code points",
            );
            expect(message).toContain("\\u2028");
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });

        it("rejects a leading U+2028 that trim() would otherwise strip", async () => {
            // Arrange — U+2028 at the start is stripped by trim(), so the old
            // code would silently accept "\u2028realpattern". The check must run
            // BEFORE trim() to catch this bypass.
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const word = chance.word();

            // Act
            const error = await useCase
                .execute({
                    targetDir: "/repo",
                    headingPatterns: [`\u2028${word}`],
                })
                .catch((e: unknown) => e);

            // Assert — leading line separator serialized as \u2028 at message start
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain(
                "headingPatterns must not contain control characters, bidi override characters, or lone surrogate code points",
            );
            expect(message).toContain('"\\u2028');
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });
    });

    describe("given a heading pattern containing a bidi isolate character", () => {
        it("throws an error before performing any file I/O", async () => {
            // Arrange — U+2066 (First Strong Isolate) can spoof terminal output
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const word = chance.word();

            // Act
            const error = await useCase
                .execute({
                    targetDir: "/repo",
                    headingPatterns: [`${word}\u2066${word}`],
                })
                .catch((e: unknown) => e);

            // Assert — bidi isolate serialized as \u2066, not embedded raw
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain(
                "headingPatterns must not contain control characters, bidi override characters, or lone surrogate code points",
            );
            expect(message).toContain("\\u2066");
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });
    });

    describe("given a heading pattern that exceeds the maximum length", () => {
        it("throws an error before performing any file I/O", async () => {
            // Arrange — 201-character pattern exceeds the 200-char limit
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const overLimitPattern = "x".repeat(201);

            // Act & Assert
            await expect(
                useCase.execute({
                    targetDir: "/repo",
                    headingPatterns: [overLimitPattern],
                }),
            ).rejects.toThrow(
                "headingPatterns entries must not exceed 200 characters",
            );
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });

        it("rejects a pattern that exceeds the Zod per-element max before any allocation", async () => {
            // Arrange — 401-character pattern exceeds the Zod .max(400) guard,
            // preventing large allocations before the application-level check fires.
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const zodOverLimitPattern = "x".repeat(401);

            // Act & Assert — must reject; exact message is Zod's validation error
            await expect(
                useCase.execute({
                    targetDir: "/repo",
                    headingPatterns: [zodOverLimitPattern],
                }),
            ).rejects.toThrow();
            expect(
                discoveryGateway.discoverInstructionFiles,
            ).not.toHaveBeenCalled();
        });
    });

    describe("given more than the maximum allowed heading patterns", () => {
        it("throws an error rather than performing quadratic-complexity matching", async () => {
            // Arrange
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const tooManyPatterns = Array.from(
                { length: 51 },
                (_, i) => `Pattern${i}`,
            );

            // Act & Assert
            await expect(
                useCase.execute({
                    targetDir: "/repo",
                    headingPatterns: tooManyPatterns,
                }),
            ).rejects.toThrow(
                "headingPatterns must contain at most 50 entries",
            );
        });

        it("does not throw when 51 entries are all duplicates of the same pattern", async () => {
            // Arrange — 51 copies of "Commands" dedup to 1 unique pattern
            const discoveryGateway = createMockDiscoveryGateway([]);
            const astGateway = createMockAstGateway();
            const commandsGateway = createMockCommandsGateway([]);
            const useCase = new AnalyzeInstructionQualityUseCase(
                discoveryGateway,
                astGateway,
                commandsGateway,
            );
            const duplicatePatterns = Array.from(
                { length: 51 },
                () => "Commands",
            );

            // Act & Assert - should not throw; effective unique count is 1
            await expect(
                useCase.execute({
                    targetDir: "/repo",
                    headingPatterns: duplicatePatterns,
                }),
            ).resolves.toBeDefined();
        });
    });
});
