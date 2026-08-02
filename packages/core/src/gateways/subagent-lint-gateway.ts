/**
 * Gateway for subagent lint file system operations.
 * Discovers Claude Code subagent files and parses YAML frontmatter.
 */

import { basename, join } from "node:path";
import type { ParsedFrontmatter } from "../entities/skill.js";
import { subagentDirectoryRoots } from "../lib/agentic-location-matchers.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type {
    DiscoveredSubagentFile,
    SubagentLintGateway,
} from "../use-cases/lint-subagent-frontmatter.js";
import { readFileNoFollow } from "./file-system-utils.js";
import { discoverMarkdownFiles } from "./markdown-file-discovery.js";

/** Maximum subagent file size: 1 MB */
const MAX_SUBAGENT_FILE_BYTES = 1_048_576;

/** Catalog subagent roots converted to OS-native relative paths. */
const SUBAGENT_DIRECTORIES = subagentDirectoryRoots().map((root) =>
    join(...root.split("/")),
);

/**
 * File system implementation of the subagent lint gateway.
 */
export class FileSystemSubagentLintGateway implements SubagentLintGateway {
    async discoverSubagents(
        targetDir: string,
    ): Promise<DiscoveredSubagentFile[]> {
        const subagents: DiscoveredSubagentFile[] = [];

        for (const subagentsDir of SUBAGENT_DIRECTORIES) {
            const discovered = await this.discoverSubagentsInDir(
                targetDir,
                subagentsDir,
            );
            subagents.push(...discovered);
        }

        return subagents;
    }

    private async discoverSubagentsInDir(
        targetDir: string,
        subagentsDir: string,
    ): Promise<DiscoveredSubagentFile[]> {
        const files = await discoverMarkdownFiles(
            targetDir,
            subagentsDir,
            (name) => basename(name, ".md"),
        );

        return files.map((file) => ({
            filePath: file.filePath,
            subagentName: file.name,
        }));
    }

    async readSubagentFileContent(filePath: string): Promise<string> {
        return readFileNoFollow(filePath, MAX_SUBAGENT_FILE_BYTES);
    }

    parseFrontmatter(content: string): ParsedFrontmatter | null {
        return parseFrontmatter(content);
    }
}

/**
 * Creates and returns the default subagent lint gateway.
 */
export function createSubagentLintGateway(): SubagentLintGateway {
    return new FileSystemSubagentLintGateway();
}
