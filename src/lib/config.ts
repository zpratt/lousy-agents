import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "c12";
import { consola } from "consola";
import type { FilesystemStructure } from "./filesystem-structure.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..");
const WEBAPP_TEMPLATE_DIR = join(PROJECT_ROOT, "ui", "copilot-with-react");
const RESTAPI_TEMPLATE_DIR = join(PROJECT_ROOT, "api", "copilot-with-fastify");
const CLI_TEMPLATE_DIR = join(PROJECT_ROOT, "cli", "copilot-with-citty");

/**
 * Configuration for lousy-agents init command
 */
export interface LousyAgentsConfig {
    /**
     * Filesystem structures for different project types
     */
    structures?: {
        cli?: FilesystemStructure;
        webapp?: FilesystemStructure;
        api?: FilesystemStructure;
        graphql?: FilesystemStructure;
    };
}

/**
 * Helper function to read CLI template files
 */
function readCliTemplateFile(relativePath: string): string {
    return readTemplateFile(relativePath, CLI_TEMPLATE_DIR);
}

/**
 * Cached CLI structure - lazy-loaded on first access
 */
let cachedCliStructure: FilesystemStructure | null = null;

/**
 * Builds the CLI project filesystem structure by reading template files
 * This is called lazily only when CLI scaffolding is needed
 */
function buildCliStructure(): FilesystemStructure {
    if (cachedCliStructure) {
        return cachedCliStructure;
    }

    cachedCliStructure = {
        nodes: [
            // Root configuration files
            {
                type: "file",
                path: "package.json",
                content: readCliTemplateFile("package.json"),
            },
            {
                type: "file",
                path: "tsconfig.json",
                content: readCliTemplateFile("tsconfig.json"),
            },
            {
                type: "file",
                path: "vitest.config.ts",
                content: readCliTemplateFile("vitest.config.ts"),
            },
            {
                type: "file",
                path: "vitest.setup.ts",
                content: readCliTemplateFile("vitest.setup.ts"),
            },
            {
                type: "file",
                path: "biome.json",
                content: readCliTemplateFile("biome.json"),
            },
            {
                type: "file",
                path: ".editorconfig",
                content: readCliTemplateFile(".editorconfig"),
            },
            {
                type: "file",
                path: ".nvmrc",
                content: readCliTemplateFile(".nvmrc"),
            },
            {
                type: "file",
                path: ".yamllint",
                content: readCliTemplateFile(".yamllint"),
            },
            // GitHub copilot instructions
            {
                type: "directory",
                path: ".github",
            },
            {
                type: "directory",
                path: ".github/instructions",
            },
            {
                type: "file",
                path: ".github/copilot-instructions.md",
                content: readCliTemplateFile(".github/copilot-instructions.md"),
            },
            {
                type: "file",
                path: ".github/instructions/test.instructions.md",
                content: readCliTemplateFile(
                    ".github/instructions/test.instructions.md",
                ),
            },
            {
                type: "file",
                path: ".github/instructions/spec.instructions.md",
                content: readCliTemplateFile(
                    ".github/instructions/spec.instructions.md",
                ),
            },
            {
                type: "file",
                path: ".github/instructions/pipeline.instructions.md",
                content: readCliTemplateFile(
                    ".github/instructions/pipeline.instructions.md",
                ),
            },
            {
                type: "file",
                path: ".github/instructions/software-architecture.instructions.md",
                content: readCliTemplateFile(
                    ".github/instructions/software-architecture.instructions.md",
                ),
            },
            // GitHub Issue Templates
            {
                type: "directory",
                path: ".github/ISSUE_TEMPLATE",
            },
            {
                type: "file",
                path: ".github/ISSUE_TEMPLATE/feature-to-spec.yml",
                content: readCliTemplateFile(
                    ".github/ISSUE_TEMPLATE/feature-to-spec.yml",
                ),
            },
            // GitHub Workflows
            {
                type: "directory",
                path: ".github/workflows",
            },
            {
                type: "file",
                path: ".github/workflows/assign-copilot.yml",
                content: readCliTemplateFile(
                    ".github/workflows/assign-copilot.yml",
                ),
            },
            {
                type: "file",
                path: ".github/workflows/ci.yml",
                content: readCliTemplateFile(".github/workflows/ci.yml"),
            },
            // Specs directory
            {
                type: "directory",
                path: ".github/specs",
            },
            {
                type: "file",
                path: ".github/specs/README.md",
                content: readCliTemplateFile(".github/specs/README.md"),
            },
            // VSCode configuration
            {
                type: "directory",
                path: ".vscode",
            },
            {
                type: "file",
                path: ".vscode/extensions.json",
                content: readCliTemplateFile(".vscode/extensions.json"),
            },
            {
                type: "file",
                path: ".vscode/launch.json",
                content: readCliTemplateFile(".vscode/launch.json"),
            },
            {
                type: "file",
                path: ".vscode/mcp.json",
                content: readCliTemplateFile(".vscode/mcp.json"),
            },
            // Devcontainer configuration
            {
                type: "directory",
                path: ".devcontainer",
            },
            {
                type: "file",
                path: ".devcontainer/devcontainer.json",
                content: readCliTemplateFile(".devcontainer/devcontainer.json"),
            },
        ],
    };

    return cachedCliStructure;
}

/**
 * Helper function to read template file content
 * @throws Error if template file cannot be read
 */
function readTemplateFile(
    relativePath: string,
    templateDir: string = WEBAPP_TEMPLATE_DIR,
): string {
    try {
        return readFileSync(join(templateDir, relativePath), "utf-8");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorMsg = `Failed to read template file ${relativePath}: ${message}`;
        consola.error(errorMsg);
        throw new Error(errorMsg);
    }
}

/**
 * Cached webapp structure - lazy-loaded on first access
 */
let cachedWebappStructure: FilesystemStructure | null = null;

/**
 * Builds the webapp project filesystem structure by reading template files
 * This is called lazily only when webapp scaffolding is needed
 */
function buildWebappStructure(): FilesystemStructure {
    if (cachedWebappStructure) {
        return cachedWebappStructure;
    }

    cachedWebappStructure = {
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
                type: "directory",
                path: ".github",
            },
            {
                type: "directory",
                path: ".github/instructions",
            },
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
            {
                type: "file",
                path: ".github/instructions/software-architecture.instructions.md",
                content: readTemplateFile(
                    ".github/instructions/software-architecture.instructions.md",
                ),
            },
            // GitHub Issue Templates
            {
                type: "directory",
                path: ".github/ISSUE_TEMPLATE",
            },
            {
                type: "file",
                path: ".github/ISSUE_TEMPLATE/feature-to-spec.yml",
                content: readTemplateFile(
                    ".github/ISSUE_TEMPLATE/feature-to-spec.yml",
                ),
            },
            // GitHub Workflows
            {
                type: "directory",
                path: ".github/workflows",
            },
            {
                type: "file",
                path: ".github/workflows/assign-copilot.yml",
                content: readTemplateFile(
                    ".github/workflows/assign-copilot.yml",
                ),
            },
            // Specs directory
            {
                type: "directory",
                path: ".github/specs",
            },
            {
                type: "file",
                path: ".github/specs/README.md",
                content: readTemplateFile(".github/specs/README.md"),
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

    return cachedWebappStructure;
}

/**
 * Cached REST API structure - lazy-loaded on first access
 */
let cachedRestApiStructure: FilesystemStructure | null = null;

/**
 * Helper function to read REST API template files
 */
function readRestApiTemplateFile(relativePath: string): string {
    return readTemplateFile(relativePath, RESTAPI_TEMPLATE_DIR);
}

/**
 * Builds the REST API project filesystem structure by reading template files
 * This is called lazily only when REST API scaffolding is needed
 */
function buildRestApiStructure(): FilesystemStructure {
    if (cachedRestApiStructure) {
        return cachedRestApiStructure;
    }

    cachedRestApiStructure = {
        nodes: [
            // Root configuration files
            {
                type: "file",
                path: "package.json",
                content: readRestApiTemplateFile("package.json"),
            },
            {
                type: "file",
                path: "tsconfig.json",
                content: readRestApiTemplateFile("tsconfig.json"),
            },
            {
                type: "file",
                path: "vitest.config.ts",
                content: readRestApiTemplateFile("vitest.config.ts"),
            },
            {
                type: "file",
                path: "vitest.integration.config.ts",
                content: readRestApiTemplateFile(
                    "vitest.integration.config.ts",
                ),
            },
            {
                type: "file",
                path: "vitest.setup.ts",
                content: readRestApiTemplateFile("vitest.setup.ts"),
            },
            {
                type: "file",
                path: "biome.json",
                content: readRestApiTemplateFile("biome.json"),
            },
            {
                type: "file",
                path: ".editorconfig",
                content: readRestApiTemplateFile(".editorconfig"),
            },
            {
                type: "file",
                path: ".nvmrc",
                content: readRestApiTemplateFile(".nvmrc"),
            },
            {
                type: "file",
                path: ".yamllint",
                content: readRestApiTemplateFile(".yamllint"),
            },
            // GitHub copilot instructions
            {
                type: "directory",
                path: ".github",
            },
            {
                type: "directory",
                path: ".github/instructions",
            },
            {
                type: "file",
                path: ".github/copilot-instructions.md",
                content: readRestApiTemplateFile(
                    ".github/copilot-instructions.md",
                ),
            },
            {
                type: "file",
                path: ".github/instructions/test.instructions.md",
                content: readRestApiTemplateFile(
                    ".github/instructions/test.instructions.md",
                ),
            },
            {
                type: "file",
                path: ".github/instructions/spec.instructions.md",
                content: readRestApiTemplateFile(
                    ".github/instructions/spec.instructions.md",
                ),
            },
            {
                type: "file",
                path: ".github/instructions/pipeline.instructions.md",
                content: readRestApiTemplateFile(
                    ".github/instructions/pipeline.instructions.md",
                ),
            },
            {
                type: "file",
                path: ".github/instructions/software-architecture.instructions.md",
                content: readRestApiTemplateFile(
                    ".github/instructions/software-architecture.instructions.md",
                ),
            },
            // GitHub Issue Templates
            {
                type: "directory",
                path: ".github/ISSUE_TEMPLATE",
            },
            {
                type: "file",
                path: ".github/ISSUE_TEMPLATE/feature-to-spec.yml",
                content: readRestApiTemplateFile(
                    ".github/ISSUE_TEMPLATE/feature-to-spec.yml",
                ),
            },
            // GitHub Workflows
            {
                type: "directory",
                path: ".github/workflows",
            },
            {
                type: "file",
                path: ".github/workflows/assign-copilot.yml",
                content: readRestApiTemplateFile(
                    ".github/workflows/assign-copilot.yml",
                ),
            },
            {
                type: "file",
                path: ".github/workflows/ci.yml",
                content: readRestApiTemplateFile(".github/workflows/ci.yml"),
            },
            // Specs directory
            {
                type: "directory",
                path: ".github/specs",
            },
            {
                type: "file",
                path: ".github/specs/README.md",
                content: readRestApiTemplateFile(".github/specs/README.md"),
            },
            // VSCode configuration
            {
                type: "directory",
                path: ".vscode",
            },
            {
                type: "file",
                path: ".vscode/extensions.json",
                content: readRestApiTemplateFile(".vscode/extensions.json"),
            },
            {
                type: "file",
                path: ".vscode/launch.json",
                content: readRestApiTemplateFile(".vscode/launch.json"),
            },
            {
                type: "file",
                path: ".vscode/mcp.json",
                content: readRestApiTemplateFile(".vscode/mcp.json"),
            },
            // Devcontainer configuration
            {
                type: "directory",
                path: ".devcontainer",
            },
            {
                type: "file",
                path: ".devcontainer/devcontainer.json",
                content: readRestApiTemplateFile(
                    ".devcontainer/devcontainer.json",
                ),
            },
        ],
    };

    return cachedRestApiStructure;
}

/**
 * Loads the configuration for the init command
 * Falls back to defaults if no configuration is found
 * Note: project structures are lazy-loaded only when requested
 */
export async function loadInitConfig(): Promise<LousyAgentsConfig> {
    const { config } = await loadConfig<LousyAgentsConfig>({
        name: "lousy-agents",
        defaults: {
            structures: {},
        },
    });

    return (
        config || {
            structures: {},
        }
    );
}

/**
 * Gets the filesystem structure for a specific project type
 * Lazy-loads webapp and REST API structures only when requested
 * @throws Error if the project type structure is not defined
 */
export async function getProjectStructure(
    projectType: "cli" | "webapp" | "api" | "graphql",
): Promise<FilesystemStructure> {
    const config = await loadInitConfig();

    // Lazy-load webapp structure only when requested
    if (projectType === "webapp") {
        return config.structures?.webapp || buildWebappStructure();
    }

    // Lazy-load REST API structure only when requested
    if (projectType === "api") {
        return config.structures?.api || buildRestApiStructure();
    }

    // Lazy-load CLI structure only when requested
    if (projectType === "cli") {
        return config.structures?.cli || buildCliStructure();
    }

    // GraphQL is not yet implemented
    throw new Error(
        `Project type "${projectType}" is not yet supported. Supported types: cli, webapp, api`,
    );
}
