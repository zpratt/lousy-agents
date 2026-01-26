/**
 * Gateway for skill file system operations.
 * This module abstracts file system access for Copilot Agent Skill files.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists } from "./file-system-utils.js";

/**
 * Interface for skill file gateway
 * Allows for different implementations (file system, mock, etc.)
 */
export interface SkillFileGateway {
    /**
     * Checks if a skill directory already exists
     * @param targetDir The root directory of the repository
     * @param skillName The normalized name of the skill
     * @returns true if the skill directory exists
     */
    skillDirectoryExists(
        targetDir: string,
        skillName: string,
    ): Promise<boolean>;

    /**
     * Ensures the .github/skills/<name> directory exists
     * @param targetDir The root directory of the repository
     * @param skillName The normalized name of the skill
     */
    ensureSkillDirectory(targetDir: string, skillName: string): Promise<void>;

    /**
     * Writes content to a SKILL.md file
     * @param targetDir The root directory of the repository
     * @param skillName The normalized name of the skill
     * @param content The content to write to the file
     */
    writeSkillFile(
        targetDir: string,
        skillName: string,
        content: string,
    ): Promise<void>;

    /**
     * Returns the full path to a skill directory
     * @param targetDir The root directory of the repository
     * @param skillName The normalized name of the skill
     * @returns The full path to the skill directory
     */
    getSkillDirectoryPath(targetDir: string, skillName: string): string;

    /**
     * Returns the full path to a SKILL.md file
     * @param targetDir The root directory of the repository
     * @param skillName The normalized name of the skill
     * @returns The full path to the SKILL.md file
     */
    getSkillFilePath(targetDir: string, skillName: string): string;
}

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
        const skillDir = this.getSkillDirectoryPath(targetDir, skillName);
        await mkdir(skillDir, { recursive: true });
    }

    async writeSkillFile(
        targetDir: string,
        skillName: string,
        content: string,
    ): Promise<void> {
        const filePath = this.getSkillFilePath(targetDir, skillName);
        await writeFile(filePath, content, { encoding: "utf-8" });
    }
}

/**
 * Creates and returns the default skill file gateway
 */
export function createSkillFileGateway(): SkillFileGateway {
    return new FileSystemSkillFileGateway();
}
