/**
 * Core domain entities for SDLC feedback loop discovery and validation.
 * These types represent scripts, tools, and their mapping to SDLC phases.
 */

/**
 * SDLC feedback loop phases that scripts and tools support
 */
export type FeedbackLoopPhase =
	| "build"
	| "test"
	| "lint"
	| "format"
	| "security"
	| "deploy"
	| "install"
	| "dev"
	| "unknown";

/**
 * Represents a discovered npm script from package.json
 */
export interface DiscoveredScript {
	/** Script name (e.g., "test", "build", "lint") */
	name: string;
	/** Script command (e.g., "vitest run", "rspack build") */
	command: string;
	/** SDLC phase this script supports */
	phase: FeedbackLoopPhase;
	/** Whether this script is considered mandatory for feedback loops */
	isMandatory: boolean;
}

/**
 * Represents a CLI tool or command discovered from GitHub Actions workflows
 */
export interface DiscoveredTool {
	/** Tool or command name (e.g., "npm", "mise run test", "biome check") */
	name: string;
	/** Full command as used (e.g., "npm ci", "mise run lint") */
	fullCommand: string;
	/** SDLC phase this tool supports */
	phase: FeedbackLoopPhase;
	/** Whether this tool is considered mandatory for feedback loops */
	isMandatory: boolean;
	/** Source workflow file where this was discovered */
	sourceWorkflow?: string;
}

/**
 * Result of discovering scripts and tools from a repository
 */
export interface DiscoveredFeedbackLoops {
	/** Discovered npm scripts */
	scripts: DiscoveredScript[];
	/** Discovered CLI tools from workflows */
	tools: DiscoveredTool[];
	/** Package manager detected (npm, yarn, pnpm, etc.) */
	packageManager?: string;
}

/**
 * Represents a reference to a script or tool in repository instructions
 */
export interface InstructionReference {
	/** The script or tool name referenced */
	target: string;
	/** File where the reference was found */
	file: string;
	/** Line number where found (if available) */
	line?: number;
	/** Context around the reference */
	context?: string;
}

/**
 * Analysis result of instruction coverage for feedback loops
 */
export interface FeedbackLoopCoverage {
	/** Scripts/tools that are mandatory but not documented */
	missingInInstructions: Array<DiscoveredScript | DiscoveredTool>;
	/** Scripts/tools that are documented */
	documentedInInstructions: Array<DiscoveredScript | DiscoveredTool>;
	/** All instruction references found */
	references: InstructionReference[];
	/** Summary statistics */
	summary: {
		totalMandatory: number;
		totalDocumented: number;
		coveragePercentage: number;
	};
}

/**
 * Maps common script names to SDLC phases
 */
export const SCRIPT_PHASE_MAPPING: Record<string, FeedbackLoopPhase> = {
	test: "test",
	"test:unit": "test",
	"test:integration": "test",
	"test:e2e": "test",
	"test:watch": "test",
	build: "build",
	compile: "build",
	bundle: "build",
	lint: "lint",
	"lint:fix": "lint",
	"lint:check": "lint",
	"lint:workflows": "lint",
	"lint:yaml": "lint",
	format: "format",
	"format:check": "format",
	"format:fix": "format",
	prettier: "format",
	"prettier:check": "format",
	"prettier:fix": "format",
	audit: "security",
	"audit:fix": "security",
	security: "security",
	deploy: "deploy",
	publish: "deploy",
	release: "deploy",
	install: "install",
	ci: "install",
	dev: "dev",
	start: "dev",
	serve: "dev",
};

/**
 * Scripts that are considered mandatory for agent feedback loops
 */
export const MANDATORY_SCRIPT_NAMES = [
	"test",
	"build",
	"lint",
	"format",
] as const;

/**
 * Determines the SDLC phase for a script based on its name and command
 */
export function determineScriptPhase(
	scriptName: string,
	command: string,
): FeedbackLoopPhase {
	// Check exact name match first
	const exactMatch = SCRIPT_PHASE_MAPPING[scriptName];
	if (exactMatch) {
		return exactMatch;
	}

	// Check if name starts with a known phase
	for (const [pattern, phase] of Object.entries(SCRIPT_PHASE_MAPPING)) {
		if (scriptName.startsWith(pattern)) {
			return phase;
		}
	}

	// Analyze command content for hints (both name and command)
	const lowerName = scriptName.toLowerCase();
	const lowerCommand = command.toLowerCase();
	const combined = `${lowerName} ${lowerCommand}`;

	if (
		combined.includes("test") ||
		combined.includes("vitest") ||
		combined.includes("jest") ||
		combined.includes("mocha") ||
		combined.includes("ava")
	) {
		return "test";
	}

	if (
		combined.includes("build") ||
		combined.includes("compile") ||
		combined.includes("webpack") ||
		combined.includes("rspack") ||
		combined.includes("rollup") ||
		combined.includes("vite build")
	) {
		return "build";
	}

	if (
		combined.includes("lint") ||
		combined.includes("eslint") ||
		combined.includes("biome") ||
		combined.includes("tslint") ||
		combined.includes("actionlint") ||
		combined.includes("yamllint")
	) {
		return "lint";
	}

	if (
		combined.includes("prettier") ||
		combined.includes("format")
	) {
		return "format";
	}

	if (
		combined.includes("audit") ||
		combined.includes("snyk") ||
		combined.includes("npm-audit")
	) {
		return "security";
	}

	return "unknown";
}

/**
 * Determines if a script is mandatory based on its phase
 */
export function isScriptMandatory(phase: FeedbackLoopPhase): boolean {
	return ["test", "build", "lint", "format"].includes(phase);
}
