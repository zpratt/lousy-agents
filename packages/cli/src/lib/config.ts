import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "c12";
import { consola } from "consola";
import type {
    FilesystemNode,
    FilesystemStructure,
} from "./filesystem-structure.js";

/**
 * Finds the package root by walking up from a starting directory
 * until a directory containing package.json is found.
 */
function findPackageRoot(startDir: string): string {
    let dir = startDir;
    while (!existsSync(join(dir, "package.json"))) {
        const parent = dirname(dir);
        if (parent === dir) {
            throw new Error(`Could not find package root from ${startDir}`);
        }
        dir = parent;
    }
    return dir;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = findPackageRoot(__dirname);
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
 * Builds the common filesystem nodes shared across all project types.
 * Each template has its own versions of these files, but the structure is identical.
 */
function buildCommonNodes(
    reader: (relativePath: string) => string,
): FilesystemNode[] {
    return [
        {
            type: "file",
            path: "biome.json",
            content: reader("biome.template.json"),
        },
        {
            type: "file",
            path: ".gitignore",
            content: reader("gitignore.template"),
        },
        {
            type: "file",
            path: ".editorconfig",
            content: reader(".editorconfig"),
        },
        {
            type: "file",
            path: ".nvmrc",
            content: reader(".nvmrc"),
        },
        {
            type: "file",
            path: ".yamllint",
            content: reader(".yamllint"),
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
            content: reader(".github/copilot-instructions.md"),
        },
        {
            type: "file",
            path: ".github/instructions/test.instructions.md",
            content: reader(".github/instructions/test.instructions.md"),
        },
        {
            type: "file",
            path: ".github/instructions/spec.instructions.md",
            content: reader(".github/instructions/spec.instructions.md"),
        },
        {
            type: "file",
            path: ".github/instructions/pipeline.instructions.md",
            content: reader(".github/instructions/pipeline.instructions.md"),
        },
        {
            type: "file",
            path: ".github/instructions/software-architecture.instructions.md",
            content: reader(
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
            content: reader(".github/ISSUE_TEMPLATE/feature-to-spec.yml"),
        },
        // GitHub Workflows
        {
            type: "directory",
            path: ".github/workflows",
        },
        {
            type: "file",
            path: ".github/workflows/assign-copilot.yml",
            content: reader(".github/workflows/assign-copilot.yml"),
        },
        {
            type: "file",
            path: ".github/workflows/ci.yml",
            content: reader(".github/workflows/ci.yml"),
        },
        // Specs directory
        {
            type: "directory",
            path: ".github/specs",
        },
        {
            type: "file",
            path: ".github/specs/README.md",
            content: reader(".github/specs/README.md"),
        },
        // VSCode configuration
        {
            type: "directory",
            path: ".vscode",
        },
        {
            type: "file",
            path: ".vscode/extensions.json",
            content: reader(".vscode/extensions.json"),
        },
        {
            type: "file",
            path: ".vscode/launch.json",
            content: reader(".vscode/launch.json"),
        },
        {
            type: "file",
            path: ".vscode/mcp.json",
            content: reader(".vscode/mcp.json"),
        },
        // Devcontainer configuration
        {
            type: "directory",
            path: ".devcontainer",
        },
        {
            type: "file",
            path: ".devcontainer/devcontainer.json",
            content: reader(".devcontainer/devcontainer.json"),
        },
    ];
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
            ...buildCommonNodes(readCliTemplateFile),
            // Source code
            {
                type: "directory",
                path: "src",
            },
            {
                type: "file",
                path: "src/index.ts",
                content: readCliTemplateFile("src/index.ts"),
            },
            {
                type: "file",
                path: "src/index.test.ts",
                content: readCliTemplateFile("src/index.test.ts"),
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
 * Helper function to read webapp template files
 */
function readWebappTemplateFile(relativePath: string): string {
    return readTemplateFile(relativePath, WEBAPP_TEMPLATE_DIR);
}

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
                content: readWebappTemplateFile("package.json"),
            },
            {
                type: "file",
                path: "tsconfig.json",
                content: readWebappTemplateFile("tsconfig.json"),
            },
            {
                type: "file",
                path: "next.config.ts",
                content: readWebappTemplateFile("next.config.ts"),
            },
            {
                type: "file",
                path: "vitest.config.ts",
                content: readWebappTemplateFile("vitest.config.ts"),
            },
            {
                type: "file",
                path: "vitest.setup.ts",
                content: readWebappTemplateFile("vitest.setup.ts"),
            },
            ...buildCommonNodes(readWebappTemplateFile),
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
            ...buildCommonNodes(readRestApiTemplateFile),
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
