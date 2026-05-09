/**
 * Gateway for discovering instruction files across multiple formats.
 * Supports GitHub Copilot, Claude Code, and community agent instruction formats.
 */

import { join, relative, resolve, sep } from "node:path";
import type {
    DiscoveredInstructionFile,
    InstructionFileFormat,
} from "../entities/instruction-quality.js";
import type { InstructionFileDiscoveryGateway } from "../use-cases/analyze-instruction-quality.js";
import {
    listDirectoryWithinRoot,
    pathExistsWithinRoot,
} from "./file-system-utils.js";

// Re-export port type for consumers
export type { InstructionFileDiscoveryGateway };

/**
 * File system implementation of the instruction file discovery gateway.
 */
export class FileSystemInstructionFileDiscoveryGateway
    implements InstructionFileDiscoveryGateway
{
    async discoverInstructionFiles(
        targetDir: string,
    ): Promise<DiscoveredInstructionFile[]> {
        const files: DiscoveredInstructionFile[] = [];

        // .github/copilot-instructions.md
        const copilotInstructions = join(".github", "copilot-instructions.md");
        if (await this.safePathExists(targetDir, copilotInstructions)) {
            files.push({
                filePath: join(targetDir, copilotInstructions),
                format: "copilot-instructions",
            });
        }

        // .github/instructions/*.md
        const instructionsDir = join(".github", "instructions");
        await this.discoverMdFilesInDir(
            targetDir,
            instructionsDir,
            "copilot-scoped",
            files,
        );

        // .github/agents/*.md
        const agentsDir = join(".github", "agents");
        await this.discoverMdFilesInDir(
            targetDir,
            agentsDir,
            "copilot-agent",
            files,
        );

        // AGENTS.md at repo root
        const agentsMd = "AGENTS.md";
        if (await this.safePathExists(targetDir, agentsMd)) {
            files.push({
                filePath: join(targetDir, agentsMd),
                format: "agents-md",
            });
        }

        // CLAUDE.md at repo root
        const claudeMd = "CLAUDE.md";
        if (await this.safePathExists(targetDir, claudeMd)) {
            files.push({
                filePath: join(targetDir, claudeMd),
                format: "claude-md",
            });
        }

        return files;
    }

    private async safePathExists(
        targetDir: string,
        relativePath: string,
    ): Promise<boolean> {
        try {
            return await pathExistsWithinRoot(targetDir, relativePath);
        } catch {
            return false;
        }
    }

    private async discoverMdFilesInDir(
        targetDir: string,
        dirPath: string,
        format: InstructionFileFormat,
        files: DiscoveredInstructionFile[],
    ): Promise<void> {
        if (!(await this.safePathExists(targetDir, dirPath))) {
            return;
        }

        try {
            const entries = await listDirectoryWithinRoot(targetDir, dirPath);
            const resolvedDirPath = resolve(targetDir, dirPath);
            for (const entry of entries) {
                if (entry.isSymbolicLink()) {
                    continue;
                }
                if (!entry.isFile()) {
                    continue;
                }
                const name = entry.name;
                if (
                    name.includes("..") ||
                    name.includes("/") ||
                    name.includes("\\")
                ) {
                    continue;
                }
                if (name.endsWith(".md")) {
                    const filePath = join(targetDir, dirPath, name);
                    const resolvedFilePath = resolve(filePath);
                    const rel = relative(resolvedDirPath, resolvedFilePath);
                    if (rel.startsWith("..") || rel.startsWith(sep)) {
                        continue;
                    }
                    files.push({
                        filePath,
                        format,
                    });
                }
            }
        } catch {
            // Skip directory if we can't read it
        }
    }
}

/**
 * Creates and returns the default instruction file discovery gateway.
 */
export function createInstructionFileDiscoveryGateway(): InstructionFileDiscoveryGateway {
    return new FileSystemInstructionFileDiscoveryGateway();
}
