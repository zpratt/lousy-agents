/**
 * Gateway for skill lint file system operations.
 * Discovers skill files and parses YAML frontmatter.
 */

import { join } from "node:path";
import { z } from "zod";
import type {
    DiscoveredSkillFile,
    ParsedFrontmatter,
} from "../entities/skill.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type { SkillLintGateway } from "../use-cases/lint-skill-frontmatter.js";
import {
    isFsSafeViolation,
    listDirectoryWithinRoot,
    pathExistsWithinRoot,
    readFileNoFollow,
    readTextWithinRoot,
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

/** Maximum lock file size: 256 KB */
const MAX_LOCK_FILE_BYTES = 262_144;

/** Relative path to the skills lock file. */
const SKILLS_LOCK_PATH = "skills-lock.json";

/** Zod schema for skills-lock.json structure */
const SkillsLockSchema = z.object({
    skills: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Reads the skills-lock.json file and returns the set of locked skill names.
 * Returns an empty set if the file does not exist or cannot be parsed.
 */
async function readLockedSkillNames(targetDir: string): Promise<Set<string>> {
    try {
        const exists = await pathExistsWithinRoot(targetDir, SKILLS_LOCK_PATH);
        if (!exists) {
            return new Set();
        }
        const content = await readTextWithinRoot(
            targetDir,
            SKILLS_LOCK_PATH,
            MAX_LOCK_FILE_BYTES,
        );
        const result = SkillsLockSchema.safeParse(JSON.parse(content));
        if (
            result.success &&
            Object.hasOwn(result.data, "skills") &&
            result.data.skills != null
        ) {
            return new Set(Object.keys(result.data.skills));
        }
        return new Set();
    } catch (error: unknown) {
        if (isFsSafeViolation(error)) {
            throw error;
        }
        return new Set();
    }
}

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

        const lockedNames = await readLockedSkillNames(targetDir);
        if (lockedNames.size === 0) {
            return skills;
        }

        return skills.filter((skill) => !lockedNames.has(skill.skillName));
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
