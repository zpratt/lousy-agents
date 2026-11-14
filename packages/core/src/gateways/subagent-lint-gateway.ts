/**
 * Gateway for subagent lint file system operations.
 * Discovers Claude Code subagent files and parses YAML frontmatter.
 */

import { basename, join, resolve } from "node:path";
import type { ParsedFrontmatter } from "../entities/skill.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type {
    DiscoveredSubagentFile,
    SubagentLintGateway,
} from "../use-cases/lint-subagent-frontmatter.js";
import {
    collapseToFirstRealFile,
    discoverSubagentFiles,
    omitSymlinkedPaths,
} from "./agentic-artifact-discovery.js";
import { readFileNoFollow } from "./file-system-utils.js";

/** Maximum subagent file size: 1 MB */
const MAX_SUBAGENT_FILE_BYTES = 1_048_576;

/**
 * File system implementation of the subagent lint gateway.
 */
export class FileSystemSubagentLintGateway implements SubagentLintGateway {
    async discoverSubagents(
        targetDir: string,
    ): Promise<DiscoveredSubagentFile[]> {
        const found = collapseToFirstRealFile(
            await omitSymlinkedPaths(
                targetDir,
                await discoverSubagentFiles(targetDir, {
                    rootDirectoryName: basename(resolve(targetDir)),
                }),
            ),
        );
        return found.map((file) => {
            const name = file.relativePath.split("/").at(-1) ?? "";
            return {
                filePath: join(targetDir, ...file.relativePath.split("/")),
                subagentName: basename(name, ".md"),
            };
        });
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
