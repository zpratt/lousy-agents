/**
 * Gateway for discovering instruction files across multiple formats.
 * Supports GitHub Copilot, Claude Code, and community agent instruction formats.
 */

import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
    DiscoveredInstructionFile,
    InstructionFileFormat,
} from "../entities/instruction-quality.js";
import { fileExists } from "./file-system-utils.js";

/**
 * Port for instruction file discovery operations.
 */
export interface InstructionFileDiscoveryGateway {
    discoverInstructionFiles(
        targetDir: string,
    ): Promise<DiscoveredInstructionFile[]>;
}

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
        const copilotInstructions = join(
            targetDir,
            ".github",
            "copilot-instructions.md",
        );
        if (await fileExists(copilotInstructions)) {
            files.push({
                filePath: copilotInstructions,
                format: "copilot-instructions",
            });
        }

        // .github/instructions/*.md
        const instructionsDir = join(targetDir, ".github", "instructions");
        await this.discoverMdFilesInDir(
            instructionsDir,
            "copilot-scoped",
            files,
        );

        // .github/agents/*.md
        const agentsDir = join(targetDir, ".github", "agents");
        await this.discoverMdFilesInDir(agentsDir, "copilot-agent", files);

        // AGENTS.md at repo root
        const agentsMd = join(targetDir, "AGENTS.md");
        if (await fileExists(agentsMd)) {
            files.push({ filePath: agentsMd, format: "agents-md" });
        }

        // CLAUDE.md at repo root
        const claudeMd = join(targetDir, "CLAUDE.md");
        if (await fileExists(claudeMd)) {
            files.push({ filePath: claudeMd, format: "claude-md" });
        }

        return files;
    }

    private async discoverMdFilesInDir(
        dirPath: string,
        format: InstructionFileFormat,
        files: DiscoveredInstructionFile[],
    ): Promise<void> {
        if (!(await fileExists(dirPath))) {
            return;
        }

        try {
            const entries = await readdir(dirPath);
            const resolvedDirPath = resolve(dirPath);
            for (const entry of entries) {
                if (
                    entry.includes("..") ||
                    entry.includes("/") ||
                    entry.includes("\\")
                ) {
                    continue;
                }
                if (entry.endsWith(".md")) {
                    const filePath = join(dirPath, entry);
                    const resolvedFilePath = resolve(filePath);
                    if (!resolvedFilePath.startsWith(`${resolvedDirPath}/`)) {
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
