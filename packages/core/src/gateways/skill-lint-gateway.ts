/**
 * Gateway for skill lint file system operations.
 * Discovers skill files and parses YAML frontmatter.
 */

import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
    DiscoveredSkillFile,
    ParsedFrontmatter,
} from "../entities/skill.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type { SkillLintGateway } from "../use-cases/lint-skill-frontmatter.js";
import { readFileNoFollow } from "./file-system-utils.js";

/** Maximum skill file size: 1 MB */
const MAX_SKILL_FILE_BYTES = 1_048_576;

/**
 * Skill directory locations to search for SKILL.md files.
 */
const SKILL_DIRECTORIES = [
    join(".github", "skills"),
    join(".claude", "skills"),
] as const;

/**
 * File system implementation of the skill lint gateway.
 */
export class FileSystemSkillLintGateway implements SkillLintGateway {
    async discoverSkills(targetDir: string): Promise<DiscoveredSkillFile[]> {
        const skills: DiscoveredSkillFile[] = [];

        for (const relativeDir of SKILL_DIRECTORIES) {
            const skillsDir = join(targetDir, relativeDir);
            const discovered = await this.discoverSkillsInDir(skillsDir);
            skills.push(...discovered);
        }

        return skills;
    }

    private async discoverSkillsInDir(
        skillsDir: string,
    ): Promise<DiscoveredSkillFile[]> {
        let dirStats: Awaited<ReturnType<typeof lstat>>;
        try {
            dirStats = await lstat(skillsDir);
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

        if (dirStats.isSymbolicLink() || !dirStats.isDirectory()) {
            return [];
        }

        let entries: import("node:fs").Dirent[];
        try {
            entries = await readdir(skillsDir, { withFileTypes: true });
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

        const skills: DiscoveredSkillFile[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            if (
                entry.name.includes("..") ||
                entry.name.includes("/") ||
                entry.name.includes("\\")
            ) {
                continue;
            }

            const skillFilePath = join(skillsDir, entry.name, "SKILL.md");

            let skillStat: Awaited<ReturnType<typeof lstat>> | null;
            try {
                skillStat = await lstat(skillFilePath);
            } catch (error: unknown) {
                if (
                    error instanceof Error &&
                    "code" in error &&
                    (error.code === "ENOENT" || error.code === "ENOTDIR")
                ) {
                    skillStat = null;
                } else {
                    throw error;
                }
            }
            if (
                skillStat &&
                !skillStat.isSymbolicLink() &&
                skillStat.isFile()
            ) {
                skills.push({
                    filePath: skillFilePath,
                    skillName: entry.name,
                });
            }
        }

        return skills;
    }

    async readSkillFileContent(filePath: string): Promise<string> {
        return readFileNoFollow(filePath, MAX_SKILL_FILE_BYTES);
    }

    parseFrontmatter(content: string): ParsedFrontmatter | null {
        return parseFrontmatter(content);
    }
}

/**
 * Creates and returns the default skill lint gateway.
 */
export function createSkillLintGateway(): SkillLintGateway {
    return new FileSystemSkillLintGateway();
}
