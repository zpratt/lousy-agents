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

const ProjectTypeSchema = z.enum(["cli", "webapp", "api", "graphql"]);
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

interface ProjectNameResult {
    projectName: string;
}

async function getValidatedProjectName(
    promptFn: (
        message: string,
        options: { type: string; placeholder: string },
    ) => Promise<unknown>,
    existingName: string | undefined,
    projectTypeLabel: string,
    placeholder: string,
): Promise<ProjectNameResult> {
    const rawProjectName: unknown = existingName
        ? existingName
        : await promptFn("What is your project name?", {
              type: "text",
              placeholder,
          });

    const projectName =
        typeof rawProjectName === "string" ? rawProjectName.trim() : "";

    if (!projectName) {
        consola.error(
            `Project name is required for ${projectTypeLabel} projects`,
        );
        throw new Error("Project name is required");
    }

    if (!isValidProjectName(projectName)) {
        const errorMessage =
            getProjectNameError(projectName) || "Invalid npm package name";
        consola.error(
            `Invalid project name: "${projectName}". ${errorMessage}`,
        );
        throw new Error(`Invalid project name. ${errorMessage}`);
    }

    return { projectName };
}

async function createWebappScaffolding(
    targetDir: string,
    templateContext: TemplateContext,
): Promise<void> {
    try {
        const webappStructure = await getProjectStructure("webapp");
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
        const restApiStructure = await getProjectStructure("api");
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
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();
        const promptFn =
            typeof context.data?.prompt === "function"
                ? context.data.prompt
                : consola.prompt.bind(consola);

        const rawProjectType: unknown = context.args.kind
            ? context.args.kind
            : await promptFn("What type of project are you initializing?", {
                  type: "select",
                  options: PROJECT_TYPE_OPTIONS,
              });

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

        if (projectType === "cli") {
            throw new Error(
                'Project type "cli" is not yet supported. Supported types: webapp, api',
            );
        } else if (projectType === "webapp") {
            const { projectName } = await getValidatedProjectName(
                promptFn,
                context.args.name,
                "webapp",
                "my-webapp",
            );

            const templateContext: TemplateContext = { projectName };
            await createWebappScaffolding(targetDir, templateContext);
            consola.info(
                "Webapp project scaffolding complete. Run 'npm install' to install dependencies.",
            );
        } else if (projectType === "api") {
            const { projectName } = await getValidatedProjectName(
                promptFn,
                context.args.name,
                "REST API",
                "my-rest-api",
            );

            const templateContext: TemplateContext = { projectName };
            await createRestApiScaffolding(targetDir, templateContext);
            consola.info(
                "REST API project scaffolding complete. Run 'npm install' to install dependencies.",
            );
        } else {
            throw new Error(
                'Project type "graphql" is not yet supported. Supported types: webapp, api',
            );
        }
    },
});
