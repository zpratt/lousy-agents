/**
 * Use case for validating instruction coverage of feedback loops
 */

import {
    discoveryLeftFilesOut,
    qualifyAllDocumented,
    qualifyUndocumented,
} from "../entities/coverage-discovery-caveat.js";
import type {
    DiscoveredScript,
    DiscoveredTool,
    FeedbackLoopCoverage,
} from "../entities/feedback-loop.js";
import type {
    DiscoverFeedbackLoopsOutput,
    DiscoverFeedbackLoopsUseCase,
} from "./discover-feedback-loops.js";

/**
 * Input for validating instruction coverage
 */
export interface ValidateInstructionCoverageInput {
    targetDir: string;
}

/**
 * Output from validating instruction coverage
 */
export interface ValidateInstructionCoverageOutput {
    coverage: FeedbackLoopCoverage;
    hasFullCoverage: boolean;
    suggestions: string[];
}

/**
 * Port for analyzing repository instruction coverage.
 */
export interface InstructionAnalysisGateway {
    analyzeCoverage(
        targetDir: string,
        scripts: DiscoveredScript[],
        tools: DiscoveredTool[],
    ): Promise<FeedbackLoopCoverage>;
}

/**
 * Use case for validating that repository instructions cover mandatory feedback loops
 */
export class ValidateInstructionCoverageUseCase {
    constructor(
        private readonly discoverFeedbackLoops: DiscoverFeedbackLoopsUseCase,
        private readonly instructionGateway: InstructionAnalysisGateway,
    ) {}

    async execute(
        input: ValidateInstructionCoverageInput,
    ): Promise<ValidateInstructionCoverageOutput> {
        if (!input.targetDir) {
            throw new Error("Target directory is required");
        }

        const discoveryResult: DiscoverFeedbackLoopsOutput =
            await this.discoverFeedbackLoops.execute({
                targetDir: input.targetDir,
            });

        const { scripts, tools, packageManager } =
            discoveryResult.feedbackLoops;

        const coverage = await this.instructionGateway.analyzeCoverage(
            input.targetDir,
            scripts,
            tools,
        );

        const suggestions = this.generateSuggestions(
            coverage,
            packageManager || "npm",
        );

        return {
            coverage,
            hasFullCoverage: coverage.summary.coveragePercentage === 100,
            suggestions,
        };
    }

    private generateSuggestions(
        coverage: FeedbackLoopCoverage,
        packageManager: string,
    ): string[] {
        const suggestions: string[] = [];
        const leftFilesOut = discoveryLeftFilesOut(coverage.diagnostics);

        if (coverage.missingInInstructions.length === 0) {
            suggestions.push(
                qualifyAllDocumented(
                    "✅ All mandatory feedback loops are documented in instructions",
                    leftFilesOut,
                ),
            );
            return suggestions;
        }

        const missingCount = coverage.missingInInstructions.length;
        const undocumented = qualifyUndocumented(
            `⚠️  ${missingCount} mandatory feedback loop(s) are not documented`,
            leftFilesOut,
        );
        suggestions.push(`${undocumented}:`);
        suggestions.push("");

        const byPhase = new Map<
            string,
            typeof coverage.missingInInstructions
        >();
        for (const item of coverage.missingInInstructions) {
            const existing = byPhase.get(item.phase) || [];
            existing.push(item);
            byPhase.set(item.phase, existing);
        }

        for (const [phase, items] of byPhase.entries()) {
            suggestions.push(`${phase.toUpperCase()} phase:`);
            for (const item of items) {
                if ("command" in item) {
                    suggestions.push(
                        `  - Document "${packageManager} run ${item.name}" (runs: ${item.command})`,
                    );
                } else {
                    suggestions.push(`  - Document "${item.fullCommand}"`);
                }
            }
            suggestions.push("");
        }

        suggestions.push(
            "Consider adding these to .github/copilot-instructions.md",
        );
        suggestions.push(
            "or creating dedicated instruction files in .github/instructions/",
        );

        return suggestions;
    }
}
