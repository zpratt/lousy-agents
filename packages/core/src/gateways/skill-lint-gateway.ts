/**
 * Gateway for skill lint file system operations.
 * Discovers skill files and parses YAML frontmatter.
 */

import { basename, join, resolve } from "node:path";
import { z } from "zod";
import type { InstructionDiscoveryDiagnosticSink } from "../entities/instruction-quality.js";
import type {
    DiscoveredSkillFile,
    ParsedFrontmatter,
} from "../entities/skill.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type { SkillLintGateway } from "../use-cases/lint-skill-frontmatter.js";
import {
    discoverSkillFiles,
    omitSymlinkedPaths,
    reportConstructLimits,
} from "./agentic-artifact-discovery.js";
import {
    isFsSafeViolation,
    pathExistsWithinRoot,
    readFileNoFollow,
    readTextWithinRoot,
} from "./file-system-utils.js";

/** Maximum skill file size: 1 MB */
const MAX_SKILL_FILE_BYTES = 1_048_576;

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
    constructor(
        private readonly limits: {
            readonly maxDirectories?: number;
            readonly maxEntries?: number;
        } = {},
    ) {}

    async discoverSkills(
        targetDir: string,
        onDiagnostic?: InstructionDiscoveryDiagnosticSink,
    ): Promise<DiscoveredSkillFile[]> {
        const walk = await discoverSkillFiles(targetDir, {
            rootDirectoryName: basename(resolve(targetDir)),
            ...this.limits,
        });
        reportConstructLimits(walk, onDiagnostic, {
            subject: "Skill discovery",
            missing: "skill files",
            consequence: "were not analyzed",
        });
        const found = await omitSymlinkedPaths(targetDir, walk.files);
        const skills: DiscoveredSkillFile[] = found.flatMap((file) => {
            const skillName = file.relativePath.split("/").at(-2) ?? "";
            if (
                skillName.includes("..") ||
                skillName.includes("/") ||
                skillName.includes("\\")
            ) {
                return [];
            }
            return [
                {
                    filePath: join(targetDir, ...file.relativePath.split("/")),
                    skillName,
                },
            ];
        });

        const lockedNames = await readLockedSkillNames(targetDir);
        if (lockedNames.size === 0) {
            return skills;
        }

        return skills.filter((skill) => !lockedNames.has(skill.skillName));
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
