import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { createAgentFileGateway } from "../gateways/agent-file-gateway.js";
import { CreateCopilotAgentUseCase } from "../use-cases/create-copilot-agent.js";

const newArgs = {
    "copilot-agent": {
        type: "string" as const,
        description:
            "Create a new GitHub Copilot custom agent with the specified name. Example: lousy-agents new --copilot-agent security",
    },
};

type NewArgs = typeof newArgs;

/**
 * The `new` command for scaffolding new resources.
 * Currently supports creating Copilot custom agents.
 */
export const newCommand = defineCommand({
    meta: {
        name: "new",
        description: "Create new resources (e.g., Copilot agents)",
    },
    args: newArgs,
    run: async (context: CommandContext<NewArgs>) => {
        // Support dependency injection for testing via context.data
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const copilotAgentName = context.args["copilot-agent"];

        if (!copilotAgentName) {
            throw new Error(
                "No resource type specified. Use --copilot-agent <name> to create a new Copilot agent.",
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
