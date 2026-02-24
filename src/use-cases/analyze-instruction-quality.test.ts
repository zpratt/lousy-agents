import Chance from "chance";
import type { Root } from "mdast";
import { describe, expect, it, vi } from "vitest";
import type { DiscoveredInstructionFile } from "../entities/instruction-quality.js";
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
            expect(output.result.suggestions[0]).toContain(
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
                "Target directory is required",
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
                    s.includes("not found in any instruction file"),
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
                    s.includes("not in code blocks"),
                ),
            ).toBe(true);
            expect(
                output.result.suggestions.some((s) =>
                    s.includes("error handling guidance"),
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
});
