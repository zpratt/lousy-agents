import { access } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { z } from "zod";
import {
    CLI_PROJECT_STRUCTURE,
    createFilesystemStructure,
} from "../lib/filesystem-structure.js";

const ProjectTypeSchema = z.enum(["CLI", "webapp", "REST API", "GraphQL API"]);
export const PROJECT_TYPE_OPTIONS = ProjectTypeSchema.options;

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function createCliScaffolding(targetDir: string): Promise<void> {
    try {
        // Check which nodes don't exist before creating
        const nodesToCreate = [];
        for (const node of CLI_PROJECT_STRUCTURE.nodes) {
            const fullPath = join(targetDir, node.path);
            if (!(await fileExists(fullPath))) {
                nodesToCreate.push(node);
            }
        }

        await createFilesystemStructure(CLI_PROJECT_STRUCTURE, targetDir);

        // Report success only for nodes that were created
        for (const node of nodesToCreate) {
            if (node.type === "directory") {
                consola.success(`Created directory: ${targetDir}/${node.path}`);
            } else if (node.type === "file") {
                consola.success(`Created file: ${targetDir}/${node.path}`);
            }
        }
    } catch (error) {
        consola.error(
            `Failed to create CLI scaffolding: ${formatErrorMessage(error)}`,
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
        } else {
            consola.info(
                `Scaffolding for ${projectType} projects will be implemented in a future release.`,
            );
        }
    },
});
