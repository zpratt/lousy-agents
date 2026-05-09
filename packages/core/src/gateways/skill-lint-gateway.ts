/**
 * Gateway for skill lint file system operations.
 * Discovers skill files and parses YAML frontmatter.
 */

import { join } from "node:path";
import type {
    DiscoveredSkillFile,
    ParsedFrontmatter,
} from "../entities/skill.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type { SkillLintGateway } from "../use-cases/lint-skill-frontmatter.js";
import {
    listDirectoryWithinRoot,
    pathExistsWithinRoot,
    readFileNoFollow,
} from "./file-system-utils.js";

/** Maximum skill file size: 1 MB */
const MAX_SKILL_FILE_BYTES = 1_048_576;

/**
 * Skill directory locations to search for SKILL.md files.
 */
const SKILL_DIRECTORIES = [
    join(".github", "skills"),
    join(".claude", "skills"),
    join(".agents", "skills"),
] as const;

/**
 * File system implementation of the skill lint gateway.
 */
export class FileSystemSkillLintGateway implements SkillLintGateway {
    async discoverSkills(targetDir: string): Promise<DiscoveredSkillFile[]> {
        const skills: DiscoveredSkillFile[] = [];

        for (const relativeDir of SKILL_DIRECTORIES) {
            const discovered = await this.discoverSkillsInDir(
                targetDir,
                relativeDir,
            );
            skills.push(...discovered);
        }

        return skills;
    }

    private async discoverSkillsInDir(
        targetDir: string,
        skillsDir: string,
    ): Promise<DiscoveredSkillFile[]> {
        try {
            if (!(await pathExistsWithinRoot(targetDir, skillsDir))) {
                return [];
            }
        } catch {
            return [];
        }

        let entries: Awaited<ReturnType<typeof listDirectoryWithinRoot>>;
        try {
            entries = await listDirectoryWithinRoot(targetDir, skillsDir);
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

            const skillRelativePath = join(skillsDir, entry.name, "SKILL.md");
            let hasSkillFile = false;
            try {
                hasSkillFile = await pathExistsWithinRoot(
                    targetDir,
                    skillRelativePath,
                );
            } catch {
                hasSkillFile = false;
            }
            if (hasSkillFile) {
                skills.push({
                    filePath: join(targetDir, skillRelativePath),
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
