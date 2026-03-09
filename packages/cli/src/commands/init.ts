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
export const SUPPORTED_PROJECT_TYPES = ["webapp", "api", "cli"] as const;

type SupportedProjectType = (typeof SUPPORTED_PROJECT_TYPES)[number];

interface ProjectTypeConfig {
    label: string;
    placeholder: string;
    structureKey: "cli" | "webapp" | "api";
}

const PROJECT_TYPE_CONFIGS: Record<SupportedProjectType, ProjectTypeConfig> = {
    cli: { label: "CLI", placeholder: "my-cli", structureKey: "cli" },
    webapp: {
        label: "webapp",
        placeholder: "my-webapp",
        structureKey: "webapp",
    },
    api: {
        label: "REST API",
        placeholder: "my-rest-api",
        structureKey: "api",
    },
};

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

async function scaffoldProject(
    projectType: SupportedProjectType,
    targetDir: string,
    templateContext: TemplateContext,
): Promise<void> {
    const config = PROJECT_TYPE_CONFIGS[projectType];
    try {
        const structure = await getProjectStructure(config.structureKey);
        await createFilesystemStructure(structure, targetDir, templateContext);
    } catch (error) {
        consola.error(
            `Failed to create ${config.label} scaffolding: ${formatErrorMessage(error)}`,
        );
        throw error;
    }
}

function isSupportedProjectType(
    projectType: string,
): projectType is SupportedProjectType {
    return SUPPORTED_PROJECT_TYPES.includes(
        projectType as SupportedProjectType,
    );
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
                  options: SUPPORTED_PROJECT_TYPES,
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

        if (!isSupportedProjectType(projectType)) {
            const supported = SUPPORTED_PROJECT_TYPES.join(", ");
            throw new Error(
                `Project type "${projectType}" is not yet supported. Supported types: ${supported}`,
            );
        }

        const config = PROJECT_TYPE_CONFIGS[projectType];
        const { projectName } = await getValidatedProjectName(
            promptFn,
            context.args.name,
            config.label,
            config.placeholder,
        );

        const templateContext: TemplateContext = { projectName };
        await scaffoldProject(projectType, targetDir, templateContext);
        consola.info(
            `${config.label} project scaffolding complete. Run 'npm install' to install dependencies.`,
        );
    },
});
