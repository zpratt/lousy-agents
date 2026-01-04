import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "c12";
import type { FilesystemStructure } from "./filesystem-structure.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..");
const WEBAPP_TEMPLATE_DIR = join(PROJECT_ROOT, "ui", "copilot-with-react");

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
 * Helper function to read template file content
 */
function readTemplateFile(relativePath: string): string {
    try {
        return readFileSync(join(WEBAPP_TEMPLATE_DIR, relativePath), "utf-8");
    } catch (error) {
        console.warn(
            `Warning: Could not read template file ${relativePath}:`,
            error,
        );
        return "";
    }
}

/**
 * Default webapp project filesystem structure
 */
const DEFAULT_WEBAPP_STRUCTURE: FilesystemStructure = {
    nodes: [
        // Root configuration files
        {
            type: "file",
            path: "package.json",
            content: readTemplateFile("package.json"),
        },
        {
            type: "file",
            path: "tsconfig.json",
            content: readTemplateFile("tsconfig.json"),
        },
        {
            type: "file",
            path: "next.config.ts",
            content: readTemplateFile("next.config.ts"),
        },
        {
            type: "file",
            path: "vitest.config.ts",
            content: readTemplateFile("vitest.config.ts"),
        },
        {
            type: "file",
            path: "vitest.setup.ts",
            content: readTemplateFile("vitest.setup.ts"),
        },
        {
            type: "file",
            path: "biome.json",
            content: readTemplateFile("biome.json"),
        },
        {
            type: "file",
            path: ".editorconfig",
            content: readTemplateFile(".editorconfig"),
        },
        {
            type: "file",
            path: ".nvmrc",
            content: readTemplateFile(".nvmrc"),
        },
        {
            type: "file",
            path: ".yamllint",
            content: readTemplateFile(".yamllint"),
        },
        // GitHub copilot instructions
        {
            type: "file",
            path: ".github/copilot-instructions.md",
            content: readTemplateFile(".github/copilot-instructions.md"),
        },
        {
            type: "file",
            path: ".github/instructions/test.instructions.md",
            content: readTemplateFile(
                ".github/instructions/test.instructions.md",
            ),
        },
        {
            type: "file",
            path: ".github/instructions/spec.instructions.md",
            content: readTemplateFile(
                ".github/instructions/spec.instructions.md",
            ),
        },
        {
            type: "file",
            path: ".github/instructions/pipeline.instructions.md",
            content: readTemplateFile(
                ".github/instructions/pipeline.instructions.md",
            ),
        },
        // VSCode configuration
        {
            type: "directory",
            path: ".vscode",
        },
        {
            type: "file",
            path: ".vscode/extensions.json",
            content: readTemplateFile(".vscode/extensions.json"),
        },
        {
            type: "file",
            path: ".vscode/launch.json",
            content: readTemplateFile(".vscode/launch.json"),
        },
        // Devcontainer configuration
        {
            type: "directory",
            path: ".devcontainer",
        },
        {
            type: "file",
            path: ".devcontainer/devcontainer.json",
            content: readTemplateFile(".devcontainer/devcontainer.json"),
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
                webapp: DEFAULT_WEBAPP_STRUCTURE,
            },
        },
    });

    return (
        config || {
            structures: {
                CLI: DEFAULT_CLI_STRUCTURE,
                webapp: DEFAULT_WEBAPP_STRUCTURE,
            },
        }
    );
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
