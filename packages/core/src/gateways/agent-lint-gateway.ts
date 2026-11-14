/**
 * Gateway for agent lint file system operations.
 * Discovers agent files and parses YAML frontmatter.
 */

import { basename, join, resolve } from "node:path";
import type { ParsedFrontmatter } from "../entities/skill.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type {
    AgentLintGateway,
    DiscoveredAgentFile,
} from "../use-cases/lint-agent-frontmatter.js";
import {
    collapseToFirstRealFile,
    discoverAgentFiles,
    omitSymlinkedPaths,
} from "./agentic-artifact-discovery.js";
import { readFileNoFollow } from "./file-system-utils.js";

/** Maximum agent file size: 1 MB */
const MAX_AGENT_FILE_BYTES = 1_048_576;

/**
 * File system implementation of the agent lint gateway.
 */
export class FileSystemAgentLintGateway implements AgentLintGateway {
    async discoverAgents(targetDir: string): Promise<DiscoveredAgentFile[]> {
        const found = collapseToFirstRealFile(
            await omitSymlinkedPaths(
                targetDir,
                await discoverAgentFiles(targetDir, {
                    rootDirectoryName: basename(resolve(targetDir)),
                }),
            ),
        );
        return found.map((file) => {
            const name = file.relativePath.split("/").at(-1) ?? "";
            return {
                filePath: join(targetDir, ...file.relativePath.split("/")),
                agentName: name.endsWith(".agent.md")
                    ? basename(name, ".agent.md")
                    : basename(name, ".md"),
            };
        });
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
