import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type {
    DiscoveredScript,
    DiscoveredTool,
    FeedbackLoopCoverage,
} from "../entities/feedback-loop.js";
import type { InstructionAnalysisGateway } from "../gateways/instruction-analysis-gateway.js";
import type {
    DiscoverFeedbackLoopsOutput,
    DiscoverFeedbackLoopsUseCase,
} from "./discover-feedback-loops.js";
import { ValidateInstructionCoverageUseCase } from "./validate-instruction-coverage.js";

const chance = new Chance();

describe("ValidateInstructionCoverageUseCase", () => {
    describe("when target directory is not provided", () => {
        it("should throw an error", async () => {
            const discoverFeedbackLoops = {
                execute: vi.fn(),
            } as unknown as DiscoverFeedbackLoopsUseCase;

            const instructionGateway: InstructionAnalysisGateway = {
                analyzeCoverage: vi.fn(),
            };

            const useCase = new ValidateInstructionCoverageUseCase(
                discoverFeedbackLoops,
                instructionGateway,
            );

            await expect(useCase.execute({ targetDir: "" })).rejects.toThrow(
                "Target directory is required",
            );
        });
    });

    describe("when all mandatory feedback loops are documented", () => {
        it("should return full coverage and success message", async () => {
            const targetDir = `/tmp/${chance.guid()}`;

            const mockScripts: DiscoveredScript[] = [
                {
                    name: "test",
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
            ];

            const mockCoverage: FeedbackLoopCoverage = {
                missingInInstructions: [],
                documentedInInstructions: mockScripts,
                references: [],
                summary: {
                    totalMandatory: 1,
                    totalDocumented: 1,
                    coveragePercentage: 100,
                },
            };

            const discoveryOutput: DiscoverFeedbackLoopsOutput = {
                feedbackLoops: {
                    scripts: mockScripts,
                    tools: [],
                    packageManager: "npm",
                },
            };

            const discoverFeedbackLoops = {
                execute: vi.fn().mockResolvedValue(discoveryOutput),
            } as unknown as DiscoverFeedbackLoopsUseCase;

            const instructionGateway: InstructionAnalysisGateway = {
                analyzeCoverage: vi.fn().mockResolvedValue(mockCoverage),
            };

            const useCase = new ValidateInstructionCoverageUseCase(
                discoverFeedbackLoops,
                instructionGateway,
            );

            const result = await useCase.execute({ targetDir });

            expect(result.hasFullCoverage).toBe(true);
            expect(result.coverage.summary.coveragePercentage).toBe(100);
            expect(result.suggestions).toContain(
                "✅ All mandatory feedback loops are documented in instructions",
            );
        });
    });

    describe("when some mandatory feedback loops are missing", () => {
        it("should return partial coverage and helpful suggestions", async () => {
            const targetDir = `/tmp/${chance.guid()}`;

            const testScript: DiscoveredScript = {
                name: "test",
                command: "vitest run",
                phase: "test",
                isMandatory: true,
            };

            const buildScript: DiscoveredScript = {
                name: "build",
                command: "rspack build",
                phase: "build",
                isMandatory: true,
            };

            const lintTool: DiscoveredTool = {
                name: "mise run lint",
                fullCommand: "mise run lint",
                phase: "lint",
                isMandatory: true,
            };

            const mockCoverage: FeedbackLoopCoverage = {
                missingInInstructions: [buildScript, lintTool],
                documentedInInstructions: [testScript],
                references: [],
                summary: {
                    totalMandatory: 3,
                    totalDocumented: 1,
                    coveragePercentage: 33.33,
                },
            };

            const discoveryOutput: DiscoverFeedbackLoopsOutput = {
                feedbackLoops: {
                    scripts: [testScript, buildScript],
                    tools: [lintTool],
                    packageManager: "npm",
                },
            };

            const discoverFeedbackLoops = {
                execute: vi.fn().mockResolvedValue(discoveryOutput),
            } as unknown as DiscoverFeedbackLoopsUseCase;

            const instructionGateway: InstructionAnalysisGateway = {
                analyzeCoverage: vi.fn().mockResolvedValue(mockCoverage),
            };

            const useCase = new ValidateInstructionCoverageUseCase(
                discoverFeedbackLoops,
                instructionGateway,
            );

            const result = await useCase.execute({ targetDir });

            expect(result.hasFullCoverage).toBe(false);
            expect(result.coverage.summary.coveragePercentage).toBe(33.33);

            // Check suggestions
            const suggestionsText = result.suggestions.join("\n");
            expect(suggestionsText).toContain("2 mandatory feedback loop(s)");
            expect(suggestionsText).toContain("BUILD phase");
            expect(suggestionsText).toContain("npm run build");
            expect(suggestionsText).toContain("LINT phase");
            expect(suggestionsText).toContain("mise run lint");
            expect(suggestionsText).toContain(
                ".github/copilot-instructions.md",
            );
        });
    });

    describe("when generating suggestions", () => {
        it("should group missing items by phase", async () => {
            const targetDir = `/tmp/${chance.guid()}`;

            const testScript: DiscoveredScript = {
                name: "test",
                command: "vitest run",
                phase: "test",
                isMandatory: true,
            };

            const testIntegrationScript: DiscoveredScript = {
                name: "test:integration",
                command: "vitest run --config vitest.integration.config.ts",
                phase: "test",
                isMandatory: true,
            };

            const buildScript: DiscoveredScript = {
                name: "build",
                command: "rspack build",
                phase: "build",
                isMandatory: true,
            };

            const mockCoverage: FeedbackLoopCoverage = {
                missingInInstructions: [
                    testScript,
                    testIntegrationScript,
                    buildScript,
                ],
                documentedInInstructions: [],
                references: [],
                summary: {
                    totalMandatory: 3,
                    totalDocumented: 0,
                    coveragePercentage: 0,
                },
            };

            const discoveryOutput: DiscoverFeedbackLoopsOutput = {
                feedbackLoops: {
                    scripts: [testScript, testIntegrationScript, buildScript],
                    tools: [],
                    packageManager: "npm",
                },
            };

            const discoverFeedbackLoops = {
                execute: vi.fn().mockResolvedValue(discoveryOutput),
            } as unknown as DiscoverFeedbackLoopsUseCase;

            const instructionGateway: InstructionAnalysisGateway = {
                analyzeCoverage: vi.fn().mockResolvedValue(mockCoverage),
            };

            const useCase = new ValidateInstructionCoverageUseCase(
                discoverFeedbackLoops,
                instructionGateway,
            );

            const result = await useCase.execute({ targetDir });

            const suggestionsText = result.suggestions.join("\n");

            // Should group by phase
            expect(suggestionsText).toContain("TEST phase");
            expect(suggestionsText).toContain("BUILD phase");

            // Should list both test scripts under TEST phase
            expect(suggestionsText).toContain("npm run test");
            expect(suggestionsText).toContain("npm run test:integration");
        });
    });

    describe("when calling gateways", () => {
        it("should pass correct parameters to gateways", async () => {
            const targetDir = `/tmp/${chance.guid()}`;

            const mockScripts: DiscoveredScript[] = [
                {
                    name: "test",
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
            ];

            const mockTools: DiscoveredTool[] = [
                {
                    name: "npm",
                    fullCommand: "npm ci",
                    phase: "install",
                    isMandatory: false,
                },
            ];

            const mockCoverage: FeedbackLoopCoverage = {
                missingInInstructions: [],
                documentedInInstructions: mockScripts,
                references: [],
                summary: {
                    totalMandatory: 1,
                    totalDocumented: 1,
                    coveragePercentage: 100,
                },
            };

            const discoveryOutput: DiscoverFeedbackLoopsOutput = {
                feedbackLoops: {
                    scripts: mockScripts,
                    tools: mockTools,
                    packageManager: "npm",
                },
            };

            const discoverFeedbackLoops = {
                execute: vi.fn().mockResolvedValue(discoveryOutput),
            } as unknown as DiscoverFeedbackLoopsUseCase;

            const analyzeCoverageMock = vi.fn().mockResolvedValue(mockCoverage);
            const instructionGateway: InstructionAnalysisGateway = {
                analyzeCoverage: analyzeCoverageMock,
            };

            const useCase = new ValidateInstructionCoverageUseCase(
                discoverFeedbackLoops,
                instructionGateway,
            );

            await useCase.execute({ targetDir });

            // Should call instruction gateway with discovered scripts and tools
            expect(analyzeCoverageMock).toHaveBeenCalledWith(
                targetDir,
                mockScripts,
                mockTools,
            );
        });
    });
});
