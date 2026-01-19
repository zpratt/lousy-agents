/**
 * Gateway for agent file system operations.
 * This module abstracts file system access for custom Copilot agent files.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists } from "./file-system-utils.js";

/**
 * Interface for agent file gateway
 * Allows for different implementations (file system, mock, etc.)
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
 * File system implementation of the agent file gateway
 */
export class FileSystemAgentFileGateway implements AgentFileGateway {
    getAgentFilePath(targetDir: string, agentName: string): string {
        return join(targetDir, ".github", "agents", `${agentName}.md`);
    }

    async agentFileExists(
        targetDir: string,
        agentName: string,
    ): Promise<boolean> {
        const filePath = this.getAgentFilePath(targetDir, agentName);
        return fileExists(filePath);
    }

    async ensureAgentsDirectory(targetDir: string): Promise<void> {
        const agentsDir = join(targetDir, ".github", "agents");
        await mkdir(agentsDir, { recursive: true });
    }

    async writeAgentFile(
        targetDir: string,
        agentName: string,
        content: string,
    ): Promise<void> {
        const filePath = this.getAgentFilePath(targetDir, agentName);
        await writeFile(filePath, content);
    }
}

/**
 * Creates and returns the default agent file gateway
 */
export function createAgentFileGateway(): AgentFileGateway {
    return new FileSystemAgentFileGateway();
}
