/**
 * Integration tests for the lint command.
 *
 * Tests end-to-end lint functionality against real skill files on disk.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lintCommand } from "./lint.js";

const chance = new Chance();

describe("Lint command end-to-end", () => {
    let projectDir: string;

    beforeAll(async () => {
        projectDir = join(tmpdir(), `e2e-lint-${chance.guid()}`);
        await mkdir(projectDir, { recursive: true });
    });

    afterAll(async () => {
        if (projectDir) {
            await rm(projectDir, { recursive: true, force: true });
        }
    });

    describe("given a repository with no skills directory", () => {
        it("should complete without error", async () => {
            // Arrange
            const emptyDir = join(projectDir, "no-skills");
            await mkdir(emptyDir, { recursive: true });

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: emptyDir },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("given a repository with a valid skill", () => {
        it("should pass lint without errors", async () => {
            // Arrange
            const repoDir = join(projectDir, "valid-repo");
            const skillDir = join(repoDir, ".github", "skills", "my-skill");
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                [
                    "---",
                    "name: my-skill",
                    "description: A well-formed skill for testing",
                    "allowed-tools: tool1, tool2",
                    "---",
                    "",
                    "# my-skill",
                    "",
                    "This skill does something useful.",
                    "",
                ].join("\n"),
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: repoDir },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("given a repository with multiple valid skills", () => {
        it("should pass lint for all skills", async () => {
            // Arrange
            const repoDir = join(projectDir, "multi-valid-repo");
            const skillNames = ["code-review", "testing", "debugging"];

            for (const name of skillNames) {
                const skillDir = join(repoDir, ".github", "skills", name);
                await mkdir(skillDir, { recursive: true });
                await writeFile(
                    join(skillDir, "SKILL.md"),
                    [
                        "---",
                        `name: ${name}`,
                        `description: Skill for ${name}`,
                        "allowed-tools: tool1",
                        "---",
                        "",
                        `# ${name}`,
                        "",
                    ].join("\n"),
                );
            }

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: repoDir },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("given a repository with a skill missing required fields", () => {
        it("should fail lint with error diagnostics", async () => {
            // Arrange
            const repoDir = join(projectDir, "missing-fields-repo");
            const skillDir = join(repoDir, ".github", "skills", "broken-skill");
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                [
                    "---",
                    "description: Missing name field",
                    "---",
                    "",
                    "# broken-skill",
                    "",
                ].join("\n"),
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: repoDir },
                }),
            ).rejects.toThrow("lint failed");
        });
    });

    describe("given a repository with a skill whose name does not match directory", () => {
        it("should fail lint with name mismatch error", async () => {
            // Arrange
            const repoDir = join(projectDir, "mismatch-repo");
            const skillDir = join(
                repoDir,
                ".github",
                "skills",
                "actual-dir-name",
            );
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                [
                    "---",
                    "name: different-name",
                    "description: Name does not match directory",
                    "allowed-tools: tool1",
                    "---",
                    "",
                    "# different-name",
                    "",
                ].join("\n"),
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: repoDir },
                }),
            ).rejects.toThrow("lint failed");
        });
    });

    describe("given a repository with a skill missing frontmatter entirely", () => {
        it("should fail lint with missing frontmatter error", async () => {
            // Arrange
            const repoDir = join(projectDir, "no-frontmatter-repo");
            const skillDir = join(
                repoDir,
                ".github",
                "skills",
                "no-frontmatter",
            );
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                [
                    "# no-frontmatter",
                    "",
                    "This file has no YAML frontmatter at all.",
                    "",
                ].join("\n"),
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: repoDir },
                }),
            ).rejects.toThrow("lint failed");
        });
    });

    describe("given a repository with mixed valid and invalid skills", () => {
        it("should fail lint and report errors for invalid skills", async () => {
            // Arrange
            const repoDir = join(projectDir, "mixed-repo");

            const validSkillDir = join(
                repoDir,
                ".github",
                "skills",
                "good-skill",
            );
            await mkdir(validSkillDir, { recursive: true });
            await writeFile(
                join(validSkillDir, "SKILL.md"),
                [
                    "---",
                    "name: good-skill",
                    "description: A valid skill",
                    "allowed-tools: tool1",
                    "---",
                    "",
                    "# good-skill",
                    "",
                ].join("\n"),
            );

            const invalidSkillDir = join(
                repoDir,
                ".github",
                "skills",
                "bad-skill",
            );
            await mkdir(invalidSkillDir, { recursive: true });
            await writeFile(
                join(invalidSkillDir, "SKILL.md"),
                ["---", "---", "", "# bad-skill", ""].join("\n"),
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: lintCommand,
                    data: { targetDir: repoDir },
                }),
            ).rejects.toThrow("lint failed");
        });
    });
});
