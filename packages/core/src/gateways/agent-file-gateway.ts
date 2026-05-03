/**
 * Gateway for agent file system operations.
 * This module abstracts file system access for custom Copilot agent files.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentFileGateway } from "../use-cases/create-copilot-agent.js";
import { fileExists, resolveSafePath } from "./file-system-utils.js";

export type { AgentFileGateway };

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
        const agentsDir = await resolveSafePath(targetDir, ".github/agents");
        await mkdir(agentsDir, { recursive: true });
    }

    async writeAgentFile(
        targetDir: string,
        agentName: string,
        content: string,
    ): Promise<void> {
        const filePath = await resolveSafePath(
            targetDir,
            `.github/agents/${agentName}.md`,
        );
        await writeFile(filePath, content, { encoding: "utf-8" });
    }
}

/**
 * Creates and returns the default agent file gateway
 */
export function createAgentFileGateway(): AgentFileGateway {
    return new FileSystemAgentFileGateway();
}
