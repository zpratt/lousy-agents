import { loadConfig } from "c12";
import type { FilesystemStructure } from "./filesystem-structure.js";

/**
 * Configuration for lousy-agents init command
 */
export interface LousyAgentsConfig {
    /**
     * Filesystem structures for different project types
     */
    structures?: {
        CLI?: FilesystemStructure;
        webapp?: FilesystemStructure;
        "REST API"?: FilesystemStructure;
        "GraphQL API"?: FilesystemStructure;
    };
}

/**
 * Default CLI project filesystem structure
 */
const DEFAULT_CLI_STRUCTURE: FilesystemStructure = {
    nodes: [
        {
            type: "directory",
            path: ".github/instructions",
        },
        {
            type: "file",
            path: ".github/copilot-instructions.md",
            content: "",
        },
    ],
};

/**
 * Loads the configuration for the init command
 * Falls back to defaults if no configuration is found
 */
export async function loadInitConfig(): Promise<LousyAgentsConfig> {
    const { config } = await loadConfig<LousyAgentsConfig>({
        name: "lousy-agents",
        defaults: {
            structures: {
                CLI: DEFAULT_CLI_STRUCTURE,
            },
        },
    });

    return config || { structures: { CLI: DEFAULT_CLI_STRUCTURE } };
}

/**
 * Gets the filesystem structure for a specific project type
 */
export async function getProjectStructure(
    projectType: "CLI" | "webapp" | "REST API" | "GraphQL API",
): Promise<FilesystemStructure | undefined> {
    const config = await loadInitConfig();
    return config.structures?.[projectType];
}
