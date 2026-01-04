import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { z } from "zod";
import { getProjectStructure } from "../lib/config.js";
import { createFilesystemStructure } from "../lib/filesystem-structure.js";

const ProjectTypeSchema = z.enum(["CLI", "webapp", "REST API", "GraphQL API"]);
export const PROJECT_TYPE_OPTIONS = ProjectTypeSchema.options;

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

async function createWebappScaffolding(targetDir: string): Promise<void> {
    try {
        // Load the webapp structure from configuration
        const webappStructure = await getProjectStructure("webapp");

        if (!webappStructure) {
            consola.warn(
                "No webapp project structure defined in configuration",
            );
            return;
        }

        await createFilesystemStructure(webappStructure, targetDir);
    } catch (error) {
        consola.error(
            `Failed to create webapp scaffolding: ${formatErrorMessage(error)}`,
        );
        throw error;
    }
}

export const initCommand = defineCommand({
    meta: {
        name: "init",
        description: "Initialize a new project with lousy agents scaffolding",
    },
    run: async (context: CommandContext) => {
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

        const rawProjectType = await promptFn(
            "What type of project are you initializing?",
            {
                type: "select",
                options: PROJECT_TYPE_OPTIONS,
            },
        );

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
            await createWebappScaffolding(targetDir);
            consola.info(
                "Webapp project scaffolding complete. Run 'npm install' to install dependencies.",
            );
        } else {
            consola.info(
                `Scaffolding for ${projectType} projects will be implemented in a future release.`,
            );
        }
    },
});
