import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";

type ProjectType = "CLI" | "webapp" | "REST API" | "GraphQL API";

const CLI_INSTRUCTIONS_TEMPLATE = `# CLI Project Instructions

This is a CLI project initialized with lousy-agents.

## Getting Started

Follow the instructions in this directory to configure your CLI project.
`;

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function createCliScaffolding(targetDir: string): Promise<void> {
    const githubDir = join(targetDir, ".github");
    const instructionsDir = join(githubDir, "instructions");
    const copilotInstructionsFile = join(githubDir, "copilot-instructions.md");

    // Create .github/instructions directory if it doesn't exist
    if (!(await fileExists(instructionsDir))) {
        await mkdir(instructionsDir, { recursive: true });
    }

    // Create .github/copilot-instructions.md file if it doesn't exist
    if (!(await fileExists(copilotInstructionsFile))) {
        await writeFile(copilotInstructionsFile, CLI_INSTRUCTIONS_TEMPLATE);
    }
}

// Allow for dependency injection for testing
let _promptOverride: typeof consola.prompt | undefined;
let _targetDir: string | undefined;

export function _setTestDependencies(deps: {
    prompt?: typeof consola.prompt;
    targetDir?: string;
}): void {
    _promptOverride = deps.prompt;
    _targetDir = deps.targetDir;
}

export function _resetTestDependencies(): void {
    _promptOverride = undefined;
    _targetDir = undefined;
}

export const initCommand = defineCommand({
    meta: {
        name: "init",
        description: "Initialize a new project with lousy agents scaffolding",
    },
    run: async (_context: CommandContext) => {
        const targetDir = _targetDir || process.cwd();
        const promptFn = _promptOverride || consola.prompt.bind(consola);

        const projectType = await promptFn<{
            type: "select";
            options: ProjectType[];
        }>("What type of project are you initializing?", {
            type: "select",
            options: ["CLI", "webapp", "REST API", "GraphQL API"],
        });

        console.log(`Selected project type: ${projectType}`);

        if (projectType === "CLI") {
            await createCliScaffolding(targetDir);
        }
    },
});
