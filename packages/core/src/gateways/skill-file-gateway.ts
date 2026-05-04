/**
 * Gateway for skill file system operations.
 * This module abstracts file system access for Copilot Agent Skill files.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillFileGateway } from "../use-cases/create-skill.js";
import { fileExists, resolveSafePath } from "./file-system-utils.js";

export type { SkillFileGateway };

/**
 * File system implementation of the skill file gateway
 */
export class FileSystemSkillFileGateway implements SkillFileGateway {
    getSkillDirectoryPath(targetDir: string, skillName: string): string {
        return join(targetDir, ".github", "skills", skillName);
    }

    getSkillFilePath(targetDir: string, skillName: string): string {
        return join(
            this.getSkillDirectoryPath(targetDir, skillName),
            "SKILL.md",
        );
    }

    async skillDirectoryExists(
        targetDir: string,
        skillName: string,
    ): Promise<boolean> {
        const dirPath = this.getSkillDirectoryPath(targetDir, skillName);
        return fileExists(dirPath);
    }

    async ensureSkillDirectory(
        targetDir: string,
        skillName: string,
    ): Promise<void> {
        const skillDir = await resolveSafePath(
            targetDir,
            `.github/skills/${skillName}`,
        );
        await mkdir(skillDir, { recursive: true });
    }

    async writeSkillFile(
        targetDir: string,
        skillName: string,
        content: string,
    ): Promise<void> {
        const filePath = await resolveSafePath(
            targetDir,
            `.github/skills/${skillName}/SKILL.md`,
        );
        await writeFile(filePath, content, { encoding: "utf-8" });
    }
}

/**
 * Creates and returns the default skill file gateway
 */
export function createSkillFileGateway(): SkillFileGateway {
    return new FileSystemSkillFileGateway();
}
