/**
 * Use case for creating GitHub Copilot custom agent files.
 * Orchestrates entity logic with gateway operations.
 */

import { z } from "zod";
import {
    generateAgentContent,
    normalizeAgentName,
} from "../entities/copilot-agent.js";
import type { AgentFileGateway } from "../gateways/agent-file-gateway.js";

/**
 * Schema for validating agent name input
 * Validates that the input is a non-empty string with reasonable constraints
 */
const AgentNameSchema = z
    .string()
    .min(1, "Agent name is required")
    .max(100, "Agent name must be 100 characters or less")
    .regex(
        /^[a-zA-Z0-9\s_-]+$/,
        "Agent name can only contain letters, numbers, spaces, hyphens, and underscores",
    );

/**
 * Result of the create copilot agent operation
 */
export interface CreateCopilotAgentResult {
    success: boolean;
    normalizedName?: string;
    filePath?: string;
    error?: string;
}

/**
 * Use case for creating a new Copilot agent file
 */
export class CreateCopilotAgentUseCase {
    constructor(private readonly gateway: AgentFileGateway) {}

    /**
     * Executes the create agent operation
     * @param targetDir The root directory of the repository
     * @param agentName The name of the agent to create
     * @returns Result of the operation
     */
    async execute(
        targetDir: string,
        agentName: string,
    ): Promise<CreateCopilotAgentResult> {
        // Validate the agent name using Zod schema
        const validationResult = AgentNameSchema.safeParse(agentName);
        if (!validationResult.success) {
            const errorMessage =
                validationResult.error.issues[0]?.message ??
                "Invalid agent name";
            return {
                success: false,
                error: errorMessage,
            };
        }

        // Normalize the agent name
        const normalizedName = normalizeAgentName(validationResult.data);

        // Validate that the normalized name is not empty (handles whitespace-only input)
        if (!normalizedName) {
            return {
                success: false,
                error: "Agent name is required",
            };
        }

        // Get the file path
        const filePath = this.gateway.getAgentFilePath(
            targetDir,
            normalizedName,
        );

        // Check if the file already exists
        if (await this.gateway.agentFileExists(targetDir, normalizedName)) {
            return {
                success: false,
                error: `Agent file already exists: ${filePath}`,
                filePath,
            };
        }

        // Ensure the directory exists
        await this.gateway.ensureAgentsDirectory(targetDir);

        // Generate the content
        const content = generateAgentContent(normalizedName);

        // Write the file
        await this.gateway.writeAgentFile(targetDir, normalizedName, content);

        return {
            success: true,
            normalizedName,
            filePath,
        };
    }
}
