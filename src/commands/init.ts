import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { z } from "zod";
import { getProjectStructure } from "../lib/config.js";
import {
    createFilesystemStructure,
    type TemplateContext,
} from "../lib/filesystem-structure.js";
import {
    getProjectNameError,
    isValidProjectName,
} from "../lib/project-name-validation.js";

const ProjectTypeSchema = z.enum(["CLI", "webapp", "REST API", "GraphQL API"]);
export const PROJECT_TYPE_OPTIONS = ProjectTypeSchema.options;

const initArgs = {
    kind: {
        type: "string" as const,
        description: `Project type: ${PROJECT_TYPE_OPTIONS.join(", ")}`,
    },
    name: {
        type: "string" as const,
        description:
            "Project name (used in package.json and other config files)",
    },
};

type InitArgs = typeof initArgs;

function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function createCliScaffolding(targetDir: string): Promise<void> {
    try {
        // Load the CLI structure from configuration
        const cliStructure = await getProjectStructure("CLI");

        if (!cliStructure) {
            consola.warn("No CLI project structure defined in configuration");
            return;
        }

        await createFilesystemStructure(cliStructure, targetDir);
    } catch (error) {
        consola.error(
            `Failed to create CLI scaffolding: ${formatErrorMessage(error)}`,
        );
        throw error;
    }
}

async function createWebappScaffolding(
    targetDir: string,
    templateContext: TemplateContext,
): Promise<void> {
    try {
        // Load the webapp structure from configuration
        const webappStructure = await getProjectStructure("webapp");

        if (!webappStructure) {
            consola.warn(
                "No webapp project structure defined in configuration",
            );
            return;
        }

        await createFilesystemStructure(
            webappStructure,
            targetDir,
            templateContext,
        );
    } catch (error) {
        consola.error(
            `Failed to create webapp scaffolding: ${formatErrorMessage(error)}`,
        );
        throw error;
    }
}

async function createRestApiScaffolding(
    targetDir: string,
    templateContext: TemplateContext,
): Promise<void> {
    try {
        // Load the REST API structure from configuration
        const restApiStructure = await getProjectStructure("REST API");

        if (!restApiStructure) {
            consola.warn(
                "No REST API project structure defined in configuration",
            );
            return;
        }

        await createFilesystemStructure(
            restApiStructure,
            targetDir,
            templateContext,
        );
    } catch (error) {
        consola.error(
            `Failed to create REST API scaffolding: ${formatErrorMessage(error)}`,
        );
        throw error;
    }
}

export const initCommand = defineCommand({
    meta: {
        name: "init",
        description: "Initialize a new project with lousy agents scaffolding",
    },
    args: initArgs,
    run: async (context: CommandContext<InitArgs>) => {
        // Support dependency injection for testing via context.data
        // Runtime checks for type safety
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();
        const promptFn =
            typeof context.data?.prompt === "function"
                ? context.data.prompt
                : consola.prompt.bind(consola);

        // Use CLI argument if provided, otherwise prompt
        const rawProjectType: unknown = context.args.kind
            ? context.args.kind
            : await promptFn("What type of project are you initializing?", {
                  type: "select",
                  options: PROJECT_TYPE_OPTIONS,
              });

        // Validate the user input at runtime
        const parseResult = ProjectTypeSchema.safeParse(rawProjectType);
        if (!parseResult.success) {
            const validOptions = PROJECT_TYPE_OPTIONS.join(", ");
            consola.error(
                `Invalid project type selected: ${String(rawProjectType)}. Valid options are: ${validOptions}`,
            );
            throw new Error(
                `Invalid project type. Expected one of: ${validOptions}`,
            );
        }

        const projectType = parseResult.data;
        consola.success(`Selected project type: ${projectType}`);

        if (projectType === "CLI") {
            await createCliScaffolding(targetDir);
            consola.info(
                "CLI project scaffolding complete. Check the .github directory for instructions.",
            );
        } else if (projectType === "webapp") {
            // Get project name from CLI argument or prompt
            const rawProjectName: unknown = context.args.name
                ? context.args.name
                : await promptFn("What is your project name?", {
                      type: "text",
                      placeholder: "my-webapp",
                  });

            const projectName =
                typeof rawProjectName === "string" ? rawProjectName.trim() : "";

            if (!projectName) {
                consola.error("Project name is required for webapp projects");
                throw new Error("Project name is required");
            }

            if (!isValidProjectName(projectName)) {
                const errorMessage =
                    getProjectNameError(projectName) ||
                    "Invalid npm package name";
                consola.error(
                    `Invalid project name: "${projectName}". ${errorMessage}`,
                );
                throw new Error(`Invalid project name. ${errorMessage}`);
            }

            const templateContext: TemplateContext = { projectName };
            await createWebappScaffolding(targetDir, templateContext);
            consola.info(
                "Webapp project scaffolding complete. Run 'npm install' to install dependencies.",
            );
        } else if (projectType === "REST API") {
            // Get project name from CLI argument or prompt
            const rawProjectName: unknown = context.args.name
                ? context.args.name
                : await promptFn("What is your project name?", {
                      type: "text",
                      placeholder: "my-rest-api",
                  });

            const projectName =
                typeof rawProjectName === "string" ? rawProjectName.trim() : "";

            if (!projectName) {
                consola.error("Project name is required for REST API projects");
                throw new Error("Project name is required");
            }

            if (!isValidProjectName(projectName)) {
                const errorMessage =
                    getProjectNameError(projectName) ||
                    "Invalid npm package name";
                consola.error(
                    `Invalid project name: "${projectName}". ${errorMessage}`,
                );
                throw new Error(`Invalid project name. ${errorMessage}`);
            }

            const templateContext: TemplateContext = { projectName };
            await createRestApiScaffolding(targetDir, templateContext);
            consola.info(
                "REST API project scaffolding complete. Run 'npm install' to install dependencies.",
            );
        } else {
            consola.info(
                `Scaffolding for ${projectType} projects will be implemented in a future release.`,
            );
        }
    },
});
