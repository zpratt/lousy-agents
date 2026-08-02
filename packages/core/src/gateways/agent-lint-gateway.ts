/**
 * Gateway for agent lint file system operations.
 * Discovers agent files and parses YAML frontmatter.
 */

import { basename, join } from "node:path";
import type { ParsedFrontmatter } from "../entities/skill.js";
import { agentDirectoryRoots } from "../lib/agentic-location-matchers.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type {
    AgentLintGateway,
    DiscoveredAgentFile,
} from "../use-cases/lint-agent-frontmatter.js";
import { readFileNoFollow } from "./file-system-utils.js";
import { discoverMarkdownFiles } from "./markdown-file-discovery.js";

/** Maximum agent file size: 1 MB */
const MAX_AGENT_FILE_BYTES = 1_048_576;

/** Catalog agent roots converted to OS-native relative paths. */
const AGENT_DIRECTORIES = agentDirectoryRoots().map((root) =>
    join(...root.split("/")),
);

/**
 * File system implementation of the agent lint gateway.
 */
export class FileSystemAgentLintGateway implements AgentLintGateway {
    async discoverAgents(targetDir: string): Promise<DiscoveredAgentFile[]> {
        const agents: DiscoveredAgentFile[] = [];

        for (const agentsDir of AGENT_DIRECTORIES) {
            const discovered = await this.discoverAgentsInDir(
                targetDir,
                agentsDir,
            );
            agents.push(...discovered);
        }

        return agents;
    }

    private async discoverAgentsInDir(
        targetDir: string,
        agentsDir: string,
    ): Promise<DiscoveredAgentFile[]> {
        const files = await discoverMarkdownFiles(
            targetDir,
            agentsDir,
            (name) =>
                name.endsWith(".agent.md")
                    ? basename(name, ".agent.md")
                    : basename(name, ".md"),
        );

        return files.map((file) => ({
            filePath: file.filePath,
            agentName: file.name,
        }));
    }

    async readAgentFileContent(filePath: string): Promise<string> {
        return readFileNoFollow(filePath, MAX_AGENT_FILE_BYTES);
    }

    parseFrontmatter(content: string): ParsedFrontmatter | null {
        return parseFrontmatter(content);
    }
}

/**
 * Creates and returns the default agent lint gateway.
 */
export function createAgentLintGateway(): AgentLintGateway {
    return new FileSystemAgentLintGateway();
}
