import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lintCommand } from "./lint.js";

const chance = new Chance();

describe("lint command", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-lint-cmd-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when no skills exist", () => {
        it("should complete without error", async () => {
            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: testDir },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("when skills have valid frontmatter", () => {
        it("should complete without error", async () => {
            // Arrange
            const skillName = "my-skill";
            const skillDir = join(testDir, ".github", "skills", skillName);
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "---\nname: my-skill\ndescription: A test skill\nallowed-tools: tool1\n---\n# My Skill\n",
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: testDir },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("when skills have invalid frontmatter", () => {
        it("should throw an error indicating lint failures", async () => {
            // Arrange
            const skillName = "my-skill";
            const skillDir = join(testDir, ".github", "skills", skillName);
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "---\ndescription: A test skill\n---\n# Missing name field\n",
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: testDir },
                }),
            ).rejects.toThrow("lint");
        });
    });

    describe("when a skill has no frontmatter", () => {
        it("should throw an error indicating missing frontmatter", async () => {
            // Arrange
            const skillName = "bad-skill";
            const skillDir = join(testDir, ".github", "skills", skillName);
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "# No frontmatter here\nJust some content\n",
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: testDir },
                }),
            ).rejects.toThrow("lint");
        });
    });

    describe("when a skill name does not match parent directory", () => {
        it("should throw an error indicating name mismatch", async () => {
            // Arrange
            const skillDir = join(testDir, ".github", "skills", "my-skill");
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "---\nname: different-name\ndescription: A test skill\n---\n# Content\n",
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: testDir },
                }),
            ).rejects.toThrow("lint");
        });
    });

    describe("when multiple skills exist with mixed validity", () => {
        it("should discover all skills and report errors", async () => {
            // Arrange
            const validSkillDir = join(
                testDir,
                ".github",
                "skills",
                "valid-skill",
            );
            const invalidSkillDir = join(
                testDir,
                ".github",
                "skills",
                "invalid-skill",
            );
            await mkdir(validSkillDir, { recursive: true });
            await mkdir(invalidSkillDir, { recursive: true });
            await writeFile(
                join(validSkillDir, "SKILL.md"),
                "---\nname: valid-skill\ndescription: A valid skill\nallowed-tools: tool1\n---\n# Valid\n",
            );
            await writeFile(
                join(invalidSkillDir, "SKILL.md"),
                "---\ndescription: Missing name\n---\n# Invalid\n",
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: testDir },
                }),
            ).rejects.toThrow("lint");
        });
    });
});
