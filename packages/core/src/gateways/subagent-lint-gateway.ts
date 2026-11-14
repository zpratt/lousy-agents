/**
 * Gateway for subagent lint file system operations.
 * Discovers Claude Code subagent files and parses YAML frontmatter.
 */

import { basename, join, resolve } from "node:path";
import type { InstructionDiscoveryDiagnosticSink } from "../entities/instruction-quality.js";
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
    reportConstructLimits,
} from "./agentic-artifact-discovery.js";
import { readFileNoFollow } from "./file-system-utils.js";

/** Maximum subagent file size: 1 MB */
const MAX_SUBAGENT_FILE_BYTES = 1_048_576;

/**
 * File system implementation of the subagent lint gateway.
 */
export class FileSystemSubagentLintGateway implements SubagentLintGateway {
    constructor(
        private readonly limits: {
            readonly maxDirectories?: number;
            readonly maxEntries?: number;
        } = {},
    ) {}

    async discoverSubagents(
        targetDir: string,
        onDiagnostic?: InstructionDiscoveryDiagnosticSink,
    ): Promise<DiscoveredSubagentFile[]> {
        const walk = await discoverSubagentFiles(targetDir, {
            rootDirectoryName: basename(resolve(targetDir)),
            ...this.limits,
        });
        reportConstructLimits(walk, onDiagnostic, {
            subject: "Subagent discovery",
            missing: "subagent files",
            consequence: "were not analyzed",
        });
        const found = collapseToFirstRealFile(
            await omitSymlinkedPaths(targetDir, walk.files),
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
