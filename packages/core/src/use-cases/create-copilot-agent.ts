/**
 * Use case for creating GitHub Copilot custom agent files.
 * Orchestrates entity logic with gateway operations.
 */

import { z } from "zod";
import {
    generateAgentContent,
    normalizeAgentName,
} from "../entities/copilot-agent.js";

/**
 * Port for agent file operations.
 */
export interface AgentFileGateway {
    /**
     * Checks if an agent file already exists
     * @param targetDir The root directory of the repository
     * @param agentName The normalized name of the agent
     * @returns true if the agent file exists
     */
    agentFileExists(targetDir: string, agentName: string): Promise<boolean>;

    /**
     * Ensures the .github/agents directory exists
     * @param targetDir The root directory of the repository
     */
    ensureAgentsDirectory(targetDir: string): Promise<void>;

    /**
     * Writes content to an agent file
     * @param targetDir The root directory of the repository
     * @param agentName The normalized name of the agent
     * @param content The content to write to the file
     */
    writeAgentFile(
        targetDir: string,
        agentName: string,
        content: string,
    ): Promise<void>;

    /**
     * Returns the full path to an agent file
     * @param targetDir The root directory of the repository
     * @param agentName The normalized name of the agent
     * @returns The full path to the agent file
     */
    getAgentFilePath(targetDir: string, agentName: string): string;
}

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

        const normalizedName = normalizeAgentName(validationResult.data);

        if (!normalizedName) {
            return {
                success: false,
                error: "Agent name is required",
            };
        }

        const filePath = this.gateway.getAgentFilePath(
            targetDir,
            normalizedName,
        );

        if (await this.gateway.agentFileExists(targetDir, normalizedName)) {
            return {
                success: false,
                error: `Agent file already exists: ${filePath}`,
                filePath,
            };
        }

        await this.gateway.ensureAgentsDirectory(targetDir);

        const content = generateAgentContent(normalizedName);

        await this.gateway.writeAgentFile(targetDir, normalizedName, content);

        return {
            success: true,
            normalizedName,
            filePath,
        };
    }
}
