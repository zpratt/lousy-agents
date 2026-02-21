/**
 * Gateway for skill lint file system operations.
 * Discovers skill files and parses YAML frontmatter.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
    DiscoveredSkillFile,
    ParsedFrontmatter,
} from "../entities/skill.js";
import type { SkillLintGateway } from "../use-cases/lint-skill-frontmatter.js";
import { fileExists } from "./file-system-utils.js";

/**
 * File system implementation of the skill lint gateway.
 */
export class FileSystemSkillLintGateway implements SkillLintGateway {
    async discoverSkills(targetDir: string): Promise<DiscoveredSkillFile[]> {
        const skillsDir = join(targetDir, ".github", "skills");

        if (!(await fileExists(skillsDir))) {
            return [];
        }

        const entries = await readdir(skillsDir, { withFileTypes: true });
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

            if (await fileExists(skillFilePath)) {
                skills.push({
                    filePath: skillFilePath,
                    skillName: entry.name,
                });
            }
        }

        return skills;
    }

    async readSkillFileContent(filePath: string): Promise<string> {
        return readFile(filePath, "utf-8");
    }

    parseFrontmatter(content: string): ParsedFrontmatter | null {
        const lines = content.split("\n");

        if (lines[0]?.trim() !== "---") {
            return null;
        }

        let endIndex = -1;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i]?.trim() === "---") {
                endIndex = i;
                break;
            }
        }

        if (endIndex === -1) {
            return null;
        }

        const yamlContent = lines.slice(1, endIndex).join("\n");
        const data = parseYaml(yamlContent) as Record<string, unknown>;

        const fieldLines = new Map<string, number>();
        for (let i = 1; i < endIndex; i++) {
            // Match YAML top-level field names: non-whitespace start, any chars except colon, then colon+space
            const match = lines[i]?.match(/^([^\s:][^:]*?):\s/);
            if (match?.[1]) {
                fieldLines.set(match[1], i + 1);
            }
        }

        return {
            data: data ?? {},
            fieldLines,
            frontmatterStartLine: 1,
        };
    }
}

/**
 * Creates and returns the default skill lint gateway.
 */
export function createSkillLintGateway(): SkillLintGateway {
    return new FileSystemSkillLintGateway();
}
