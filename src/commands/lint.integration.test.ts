/**
 * Integration tests for the lint command.
 *
 * Tests end-to-end lint functionality against real skill files on disk.
 */

import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import Chance from "chance";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { lintCommand } from "./lint.js";

const execFileAsync = promisify(execFile);
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

    afterEach(() => {
        process.exitCode = undefined;
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
                    args: { _: [], skills: true },
                    cmd: lintCommand,
                    data: { targetDir: emptyDir, skills: true },
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
                    args: { _: [], skills: true },
                    cmd: lintCommand,
                    data: { targetDir: repoDir, skills: true },
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
                    args: { _: [], skills: true },
                    cmd: lintCommand,
                    data: { targetDir: repoDir, skills: true },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("given a repository with a skill missing required fields", () => {
        it("should set non-zero exit code for lint failures", async () => {
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

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: repoDir, skills: true },
            });

            // Assert
            expect(process.exitCode).toBe(1);
        });
    });

    describe("given a repository with a skill whose name does not match directory", () => {
        it("should set non-zero exit code for name mismatch", async () => {
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

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: repoDir, skills: true },
            });

            // Assert
            expect(process.exitCode).toBe(1);
        });
    });

    describe("given a repository with a skill missing frontmatter entirely", () => {
        it("should set non-zero exit code for missing frontmatter", async () => {
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

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: repoDir, skills: true },
            });

            // Assert
            expect(process.exitCode).toBe(1);
        });
    });

    describe("given a repository with mixed valid and invalid skills", () => {
        it("should set non-zero exit code for mixed validity", async () => {
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

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: repoDir, skills: true },
            });

            // Assert
            expect(process.exitCode).toBe(1);
        });
    });

    describe("given lint failures with rdjsonl format", () => {
        it("should produce parseable rdjsonl output without a stack trace", async () => {
            // Arrange
            const repoDir = join(projectDir, "rdjsonl-output-repo");
            const skillDir = join(
                repoDir,
                ".github",
                "skills",
                "invalid-skill",
            );
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                [
                    "---",
                    "description: Missing name field",
                    "---",
                    "",
                    "# invalid-skill",
                    "",
                ].join("\n"),
            );

            // Act
            const tsxPath = join(process.cwd(), "node_modules", ".bin", "tsx");
            const entryPath = join(process.cwd(), "src", "index.ts");

            let stdout: string;
            let stderr: string;
            try {
                const result = await execFileAsync(
                    tsxPath,
                    [entryPath, "lint", "--skills", "--format", "rdjsonl"],
                    {
                        cwd: repoDir,
                        // biome-ignore lint/style/useNamingConvention: env var
                        env: { ...process.env, NO_COLOR: "1" },
                    },
                );
                stdout = result.stdout;
                stderr = result.stderr;
            } catch (err: unknown) {
                const execErr = err as { stdout: string; stderr: string };
                stdout = execErr.stdout;
                stderr = execErr.stderr;
            }

            // Assert - each non-empty line of stdout must be valid JSON
            const lines = stdout
                .split("\n")
                .filter((line) => line.trim() !== "");
            expect(lines.length).toBeGreaterThan(0);

            for (const line of lines) {
                expect(() => JSON.parse(line)).not.toThrow();
            }

            // Assert - stderr must not contain a stack trace
            expect(stderr).not.toMatch(/^\s+at\s+/m);
        });
    });
});
