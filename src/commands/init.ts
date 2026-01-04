import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { z } from "zod";

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
    const githubDir = join(targetDir, ".github");
    const instructionsDir = join(githubDir, "instructions");
    const copilotInstructionsFile = join(githubDir, "copilot-instructions.md");

    // Create .github/instructions directory if it doesn't exist
    if (!(await fileExists(instructionsDir))) {
        try {
            await mkdir(instructionsDir, { recursive: true });
            consola.success(`Created directory: ${instructionsDir}`);
        } catch (error) {
            consola.error(
                `Failed to create instructions directory at "${instructionsDir}": ${formatErrorMessage(error)}`,
            );
            throw error;
        }
    }

    // Create .github/copilot-instructions.md file if it doesn't exist
    if (!(await fileExists(copilotInstructionsFile))) {
        try {
            await writeFile(copilotInstructionsFile, "", "utf-8");
            consola.success(`Created file: ${copilotInstructionsFile}`);
        } catch (error) {
            consola.error(
                `Failed to create Copilot instructions file at "${copilotInstructionsFile}": ${formatErrorMessage(error)}`,
            );
            throw error;
        }
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
