/**
 * Gateway for agent lint file system operations.
 * Discovers agent files and parses YAML frontmatter.
 */

import { lstat, readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { ParsedFrontmatter } from "../entities/skill.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type {
    AgentLintGateway,
    DiscoveredAgentFile,
} from "../use-cases/lint-agent-frontmatter.js";
import { readFileNoFollow } from "./file-system-utils.js";

/** Maximum agent file size: 1 MB */
const MAX_AGENT_FILE_BYTES = 1_048_576;

/**
 * File system implementation of the agent lint gateway.
 */
export class FileSystemAgentLintGateway implements AgentLintGateway {
    async discoverAgents(targetDir: string): Promise<DiscoveredAgentFile[]> {
        const agentsDir = join(targetDir, ".github", "agents");

        let agentsDirStats: Awaited<ReturnType<typeof lstat>>;
        try {
            agentsDirStats = await lstat(agentsDir);
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                "code" in error &&
                (error.code === "ENOENT" || error.code === "ENOTDIR")
            ) {
                return [];
            }
            throw error;
        }

        if (agentsDirStats.isSymbolicLink() || !agentsDirStats.isDirectory()) {
            return [];
        }

        const resolvedAgentsDir = resolve(agentsDir);
        const agents: DiscoveredAgentFile[] = [];

        const walk = async (dir: string): Promise<void> => {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const name = entry.name;
                if (
                    name.includes("..") ||
                    name.includes("/") ||
                    name.includes("\\")
                ) {
                    continue;
                }

                const entryPath = join(dir, name);
                const resolvedPath = resolve(entryPath);
                const rel = relative(resolvedAgentsDir, resolvedPath);
                if (rel.startsWith("..") || rel.startsWith(sep)) {
                    continue;
                }

                if (entry.isSymbolicLink()) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await walk(entryPath);
                    continue;
                }

                if (!entry.isFile()) {
                    continue;
                }

                if (!name.endsWith(".md")) {
                    continue;
                }

                const agentName = name.endsWith(".agent.md")
                    ? basename(name, ".agent.md")
                    : basename(name, ".md");
                agents.push({ filePath: entryPath, agentName });
            }
        };

        await walk(agentsDir);
        return agents;
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
