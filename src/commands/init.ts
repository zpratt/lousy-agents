import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { z } from "zod";

const ProjectTypeSchema = z.enum(["CLI", "webapp", "REST API", "GraphQL API"]);

const CLI_INSTRUCTIONS_TEMPLATE = `# Copilot Instructions for CLI Projects

This repository was initialized as a **CLI project** using the lousy-agents scaffolding.
This file exists to guide GitHub Copilot and other coding agents when working on this project.

---

## 1. Before you start

- Read the project context at \`.github/context/project.context.md\` for goals, personas, and constraints.
- Skim any specs under \`.github/specs/\` to understand current features and tasks.
- Use \`npm install\` (or your chosen toolchain) to install dependencies before running commands.

When asking Copilot to implement changes, always:

- Reference the relevant spec file (Requirements, Design, Tasks).
- State which **Task** to implement.
- Remind Copilot to follow this file for engineering and workflow guidance.

---

## 2. Project workflow (for coding agents)

1. **Research**
   - Search the codebase for existing patterns (e.g., commands under \`src/commands/\`, utilities under \`src/lib/\`).
   - Read any related spec in \`.github/specs/<feature>/spec.md\`.

2. **TDD loop**
   - Write a failing test that describes the desired behavior.
   - Run the test suite (for example: \`npm test\` or \`mise run test\` if mise is configured).
   - Implement the minimal code to make the test pass.
   - Re-run tests and then refactor while keeping tests green.

3. **Validation**
   - Run the full validation pipeline (for example: \`mise run ci && npm run build\`, if available).
   - Ensure no new lint or type errors are introduced.

---

## 3. CLI-specific guidance

- New commands should live under \`src/commands/\` and be wired into the main CLI entrypoint.
- Keep commands small and focused; extract shared logic into \`src/lib/\` where appropriate.
- Prefer TypeScript with strict typing and small, single-purpose functions.
- Validate all external data at runtime (e.g., with Zod) instead of using type assertions.
- When a command interacts with external services (HTTP, filesystem, etc.), ensure:
  - Errors are surfaced with clear, actionable messages.
  - Behavior is covered by tests (happy path, error path, edge cases).

---

## 4. Working with specs and tasks

Specs in this project follow a three-part structure:

- **Requirements** — Problem statement, personas, value, user stories (with EARS acceptance criteria).
- **Design** — How the feature fits into the system and which components are affected.
- **Tasks** — Small, independently-implementable units of work for coding agents.

When assigning work to Copilot:

- Point to the spec file (e.g., \`.github/specs/feature-name/spec.md\`).
- Specify the exact Task to implement (e.g., "Implement Task 1: Add CLI flag validation").
- Include relevant verification steps (commands to run, tests to pass).

---

## 5. Next steps after \`lousy-agents init\`

1. Open \`.github/context/project.context.md\` and tailor it to your project.
2. Create your first spec in \`.github/specs/<feature-name>/spec.md\` using the provided template.
3. Add or update CLI commands under \`src/commands/\` to support that feature.
4. Use this file when prompting Copilot so it respects your workflow and standards.

This file is a **starting point**. As your CLI project evolves, update these instructions to reflect
your actual architecture, workflows, and conventions.
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
        try {
            await mkdir(instructionsDir, { recursive: true });
            consola.success(`Created directory: ${instructionsDir}`);
        } catch (error) {
            consola.error(
                `Failed to create instructions directory at "${instructionsDir}".`,
            );
            throw error;
        }
    }

    // Create .github/copilot-instructions.md file if it doesn't exist
    if (!(await fileExists(copilotInstructionsFile))) {
        try {
            await writeFile(
                copilotInstructionsFile,
                CLI_INSTRUCTIONS_TEMPLATE,
                "utf-8",
            );
            consola.success(`Created file: ${copilotInstructionsFile}`);
        } catch (error) {
            consola.error(
                `Failed to create Copilot instructions file at "${copilotInstructionsFile}".`,
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
        const targetDir =
            (context.data?.targetDir as string | undefined) || process.cwd();
        const promptFn =
            (context.data?.prompt as typeof consola.prompt | undefined) ||
            consola.prompt.bind(consola);

        const rawProjectType = await promptFn(
            "What type of project are you initializing?",
            {
                type: "select",
                options: ["CLI", "webapp", "REST API", "GraphQL API"],
            },
        );

        // Validate the user input at runtime
        const parseResult = ProjectTypeSchema.safeParse(rawProjectType);
        if (!parseResult.success) {
            consola.error(
                `Invalid project type selected: ${String(rawProjectType)}`,
            );
            throw new Error("Invalid project type");
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
