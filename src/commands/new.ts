import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { createAgentFileGateway } from "../gateways/agent-file-gateway.js";
import { createSkillFileGateway } from "../gateways/skill-file-gateway.js";
import { CreateCopilotAgentUseCase } from "../use-cases/create-copilot-agent.js";
import { CreateSkillUseCase } from "../use-cases/create-skill.js";

const copilotAgentArgs = {
    "copilot-agent": {
        type: "string" as const,
        description:
            "Create a new GitHub Copilot custom agent with the specified name. Example: lousy-agents new --copilot-agent security",
    },
};

type CopilotAgentArgs = typeof copilotAgentArgs;

const skillArgs = {
    name: {
        type: "positional" as const,
        description:
            "The name of the skill to create. Example: lousy-agents new skill github-actions-debug",
        required: true,
    },
};

type SkillArgs = typeof skillArgs;

/**
 * The `skill` subcommand for creating Agent Skills
 */
export const skillCommand = defineCommand({
    meta: {
        name: "skill",
        description:
            "Create a new GitHub Copilot Agent Skill. Example: lousy-agents new skill github-actions-debug",
    },
    args: skillArgs,
    run: async (context: CommandContext<SkillArgs>) => {
        // Support dependency injection for testing via context.data
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const skillName = context.args.name;

        if (!skillName) {
            throw new Error(
                "Missing required argument: <name>. Example: lousy-agents new skill github-actions-debug",
            );
        }

        // Create the use case with the file system gateway
        const gateway = createSkillFileGateway();
        const useCase = new CreateSkillUseCase(gateway);

        // Execute the use case
        const result = await useCase.execute(targetDir, skillName);

        if (!result.success) {
            throw new Error(result.error);
        }

        consola.success(`Created Agent Skill: ${result.skillFilePath}`);
    },
});

/**
 * The `new` command for scaffolding new resources.
 * Supports creating Copilot custom agents and Agent Skills.
 */
export const newCommand = defineCommand({
    meta: {
        name: "new",
        description:
            "Create new resources (e.g., Copilot agents, skills). Use 'new skill <name>' to create an Agent Skill.",
    },
    args: copilotAgentArgs,
    subCommands: {
        skill: skillCommand,
    },
    run: async (context: CommandContext<CopilotAgentArgs>) => {
        // citty runs both the subcommand's run function and the parent's run function.
        // We need to detect when a subcommand was invoked and exit early to avoid
        // throwing an error for missing --copilot-agent option.
        const subCommand = context.rawArgs[0];
        if (subCommand === "skill") {
            return; // Subcommand was handled by skillCommand.run
        }

        // Support dependency injection for testing via context.data
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const copilotAgentName = context.args["copilot-agent"];

        if (!copilotAgentName) {
            throw new Error(
                "Missing required option. Use one of:\n" +
                    "  --copilot-agent <name>  Create a Copilot custom agent\n" +
                    "  skill <name>            Create an Agent Skill\n\n" +
                    "Examples:\n" +
                    "  lousy-agents new --copilot-agent security\n" +
                    "  lousy-agents new skill github-actions-debug",
            );
        }

        // Create the use case with the file system gateway
        const gateway = createAgentFileGateway();
        const useCase = new CreateCopilotAgentUseCase(gateway);

        // Execute the use case
        const result = await useCase.execute(targetDir, copilotAgentName);

        if (!result.success) {
            throw new Error(result.error);
        }

        consola.success(`Created Copilot agent: ${result.filePath}`);
    },
});
