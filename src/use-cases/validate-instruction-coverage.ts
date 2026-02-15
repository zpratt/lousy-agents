/**
 * Use case for validating instruction coverage of feedback loops
 */

import type { FeedbackLoopCoverage } from "../entities/feedback-loop.js";
import type { InstructionAnalysisGateway } from "../gateways/instruction-analysis-gateway.js";
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

		// First, discover all feedback loops
		const discoveryResult: DiscoverFeedbackLoopsOutput =
			await this.discoverFeedbackLoops.execute({
				targetDir: input.targetDir,
			});

		const { scripts, tools } = discoveryResult.feedbackLoops;

		// Analyze instruction coverage
		const coverage = await this.instructionGateway.analyzeCoverage(
			input.targetDir,
			scripts,
			tools,
		);

		// Generate suggestions for missing documentation
		const suggestions = this.generateSuggestions(coverage);

		return {
			coverage,
			hasFullCoverage: coverage.summary.coveragePercentage === 100,
			suggestions,
		};
	}

	private generateSuggestions(coverage: FeedbackLoopCoverage): string[] {
		const suggestions: string[] = [];

		if (coverage.missingInInstructions.length === 0) {
			suggestions.push(
				"✅ All mandatory feedback loops are documented in instructions",
			);
			return suggestions;
		}

		suggestions.push(
			`⚠️  ${coverage.missingInInstructions.length} mandatory feedback loop(s) are not documented:`,
		);
		suggestions.push("");

		// Group by phase
		const byPhase = new Map<string, typeof coverage.missingInInstructions>();
		for (const item of coverage.missingInInstructions) {
			const existing = byPhase.get(item.phase) || [];
			existing.push(item);
			byPhase.set(item.phase, existing);
		}

		// Generate suggestions per phase
		for (const [phase, items] of byPhase.entries()) {
			suggestions.push(`${phase.toUpperCase()} phase:`);
			for (const item of items) {
				if ("command" in item) {
					// It's a script
					suggestions.push(
						`  - Document "npm run ${item.name}" (runs: ${item.command})`,
					);
				} else {
					// It's a tool
					suggestions.push(`  - Document "${item.fullCommand}"`);
				}
			}
			suggestions.push("");
		}

		suggestions.push("Consider adding these to .github/copilot-instructions.md");
		suggestions.push(
			"or creating dedicated instruction files in .github/instructions/",
		);

		return suggestions;
	}
}
