import { resolve } from "node:path";
import type { ResolvedVersion } from "@lousy-agents/core/entities/copilot-setup.js";
import {
    createEnvironmentGateway,
    createWorkflowGateway,
} from "@lousy-agents/core/gateways/index.js";
import { loadCopilotSetupConfig } from "@lousy-agents/core/lib/copilot-setup-config.js";
import { initCopilotSetupWorkflow } from "@lousy-agents/core/use-cases/init-copilot-setup-workflow.js";
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

/**
 * SHA-pinned action versions for new projects.
 * Actions shared with the repository's copilot-setup-steps.yml (checkout, setup-node,
 * setup-python) use the same SHAs for consistency. Additional entries (setup-java,
 * setup-go, mise-action) are defaults for newly scaffolded projects that may need them.
 */
const INIT_RESOLVED_VERSIONS: ResolvedVersion[] = [
    {
        action: "actions/checkout",
        sha: "0c366fd6a839edf440554fa01a7085ccba70ac98",
        versionTag: "v6.0.2",
    },
    {
        action: "actions/setup-node",
        sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
        versionTag: "v6.1.0",
    },
    {
        action: "actions/setup-python",
        sha: "28f2168f4d98ee0445e3c6321f6e6616c83dd5ec",
        versionTag: "v6.2.0",
    },
    {
        action: "actions/setup-java",
        sha: "7a6d8a8234af8eb26422e24e3006232cccaa061b",
        versionTag: "v4.6.0",
    },
    {
        action: "actions/setup-go",
        sha: "5fbf81aa9aa1f4a83e0b6f3c86e690bc4c2aebfe",
        versionTag: "v5.3.0",
    },
    {
        action: "jdx/mise-action",
        sha: "c1ecc8f748cd28cdeabf76dab3cccde4ce692fe4",
        versionTag: "v3.6.1",
    },
];

async function generateCopilotSetupWorkflow(targetDir: string): Promise<void> {
    // Normalize path to prevent traversal (e.g., ../../malicious) before
    // passing to config loading or gateway construction.
    const resolvedTargetDir = resolve(targetDir);

    const workflowGateway = createWorkflowGateway(resolvedTargetDir);
    const environmentGateway = createEnvironmentGateway(resolvedTargetDir);
    const copilotSetupConfig = await loadCopilotSetupConfig(resolvedTargetDir);

    const result = await initCopilotSetupWorkflow(
        {
            targetDir: resolvedTargetDir,
            resolvedVersions: INIT_RESOLVED_VERSIONS,
        },
        workflowGateway,
        environmentGateway,
        copilotSetupConfig,
    );

    if (!result.created) {
        consola.info(
            "Copilot setup workflow already exists - preserving existing file",
        );
        return;
    }

    consola.success(
        `Created copilot-setup-steps.yml with ${result.stepCount} step(s)`,
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

        // Generate copilot-setup-steps.yml workflow based on detected environment
        await generateCopilotSetupWorkflow(targetDir);

        consola.info(
            `${config.label} project scaffolding complete. Run 'npm install' to install dependencies.`,
        );
    },
});
