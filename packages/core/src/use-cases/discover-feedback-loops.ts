/**
 * Use case for discovering and analyzing SDLC feedback loops
 */

import type { PackageManagerFile } from "../entities/copilot-setup.js";
import type {
    DiscoveredFeedbackLoops,
    DiscoveredScript,
    DiscoveredTool,
} from "../entities/feedback-loop.js";

/**
 * Port for detecting package managers.
 */
export interface PackageManagerGateway {
    detectPackageManagers(targetDir: string): Promise<PackageManagerFile[]>;
}

/**
 * Port for discovering scripts from package manifests.
 */
export interface ScriptDiscoveryGateway {
    /**
     * Discovers scripts from package.json in the target directory
     * @param targetDir The directory to search for package.json
     * @returns Array of discovered scripts
     */
    discoverScripts(targetDir: string): Promise<DiscoveredScript[]>;
}

/**
 * Port for discovering CLI tools from GitHub Actions workflows.
 */
export interface ToolDiscoveryGateway {
    /**
     * Discovers CLI tools and commands from GitHub Actions workflows
     * @param targetDir The repository root directory
     * @returns Array of discovered tools
     */
    discoverTools(targetDir: string): Promise<DiscoveredTool[]>;
}

/**
 * Input for discovering feedback loops
 */
export interface DiscoverFeedbackLoopsInput {
    targetDir: string;
}

/**
 * Output from discovering feedback loops
 */
export interface DiscoverFeedbackLoopsOutput {
    feedbackLoops: DiscoveredFeedbackLoops;
}

/**
 * Use case for discovering scripts and tools that form SDLC feedback loops
 */
export class DiscoverFeedbackLoopsUseCase {
    constructor(
        private readonly scriptGateway: ScriptDiscoveryGateway,
        private readonly toolGateway: ToolDiscoveryGateway,
        private readonly packageManagerGateway: PackageManagerGateway,
    ) {}

    async execute(
        input: DiscoverFeedbackLoopsInput,
    ): Promise<DiscoverFeedbackLoopsOutput> {
        if (!input.targetDir) {
            throw new Error("Target directory is required");
        }

        // Discover scripts from package.json
        const scripts = await this.scriptGateway.discoverScripts(
            input.targetDir,
        );

        // Discover tools from GitHub Actions workflows
        const tools = await this.toolGateway.discoverTools(input.targetDir);

        // Detect package manager
        const packageManagers =
            await this.packageManagerGateway.detectPackageManagers(
                input.targetDir,
            );
        const primaryPackageManager =
            packageManagers.length > 0 ? packageManagers[0].type : undefined;

        const feedbackLoops: DiscoveredFeedbackLoops = {
            scripts: this.sortByPhase(scripts),
            tools: this.sortByPhase(tools),
            packageManager: primaryPackageManager,
        };

        return { feedbackLoops };
    }

    /**
     * Sorts scripts or tools by phase priority
     * Order: test, lint, format, build, security, install, dev, deploy, unknown
     */
    private sortByPhase<T extends DiscoveredScript | DiscoveredTool>(
        items: T[],
    ): T[] {
        const phasePriority: Record<string, number> = {
            test: 1,
            lint: 2,
            format: 3,
            build: 4,
            security: 5,
            install: 6,
            dev: 7,
            deploy: 8,
            unknown: 9,
        };

        return [...items].sort((a, b) => {
            const priorityA = phasePriority[a.phase] ?? 10;
            const priorityB = phasePriority[b.phase] ?? 10;
            return priorityA - priorityB;
        });
    }
}
