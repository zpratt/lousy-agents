/**
 * Gateway for agent lint file system operations.
 * Discovers agent files and parses YAML frontmatter.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ParsedFrontmatter } from "../entities/skill.js";
import type {
    AgentLintGateway,
    DiscoveredAgentFile,
} from "../use-cases/lint-agent-frontmatter.js";
import { fileExists } from "./file-system-utils.js";

/**
 * File system implementation of the agent lint gateway.
 */
export class FileSystemAgentLintGateway implements AgentLintGateway {
    async discoverAgents(targetDir: string): Promise<DiscoveredAgentFile[]> {
        const agentsDir = join(targetDir, ".github", "agents");

        if (!(await fileExists(agentsDir))) {
            return [];
        }

        const entries = await readdir(agentsDir);
        const agents: DiscoveredAgentFile[] = [];

        for (const entry of entries) {
            if (
                entry.includes("..") ||
                entry.includes("/") ||
                entry.includes("\\")
            ) {
                continue;
            }

            if (!entry.endsWith(".md")) {
                continue;
            }

            const filePath = join(agentsDir, entry);
            const resolvedPath = resolve(filePath);
            const resolvedAgentsDir = resolve(agentsDir);
            if (!resolvedPath.startsWith(`${resolvedAgentsDir}/`)) {
                continue;
            }

            const agentName = basename(entry, ".md");

            agents.push({ filePath, agentName });
        }

        return agents;
    }

    async readAgentFileContent(filePath: string): Promise<string> {
        return readFile(filePath, "utf-8");
    }

    parseFrontmatter(content: string): ParsedFrontmatter | null {
        const lines = content.split("\n");

        if (lines[0]?.trim() !== "---") {
            return null;
        }

        let endIndex = -1;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i]?.trim() === "---") {
                endIndex = i;
                break;
            }
        }

        if (endIndex === -1) {
            return null;
        }

        const yamlContent = lines.slice(1, endIndex).join("\n");

        let data: Record<string, unknown>;
        try {
            const parsed: unknown = parseYaml(yamlContent);
            data =
                parsed !== null &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
                    ? (parsed as Record<string, unknown>)
                    : {};
        } catch {
            return null;
        }

        const fieldLines = new Map<string, number>();
        for (let i = 1; i < endIndex; i++) {
            const match = lines[i]?.match(/^([^\s:][^:]*?):\s/);
            if (match?.[1]) {
                fieldLines.set(match[1], i + 1);
            }
        }

        return {
            data: data ?? {},
            fieldLines,
            frontmatterStartLine: 1,
        };
    }
}

/**
 * Creates and returns the default agent lint gateway.
 */
export function createAgentLintGateway(): AgentLintGateway {
    return new FileSystemAgentLintGateway();
}
