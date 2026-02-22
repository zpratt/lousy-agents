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
            const discoveryGateway = createMockDiscoveryGateway(files);
            const astGateway = createMockAstGateway(structures);
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

            // Assert - should use file2's better score
            expect(output.result.commandScores[0].structuralContext).toBe(1);
            expect(output.result.commandScores[0].executionClarity).toBe(1);
            expect(output.result.commandScores[0].bestSourceFile).toBe(file2);
        });
    });
});
