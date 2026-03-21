/**
 * Integration tests for the lint command.
 *
 * Tests end-to-end lint functionality against real skill files on disk.
 */

import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Chance from "chance";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { lintCommand } from "./lint.js";

const execFileAsync = promisify(execFile);
const chance = new Chance();
const cliPackageDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
);

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
            const entryPath = join(cliPackageDir, "src", "index.ts");

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
                const execErr = err as {
                    stdout?: string;
                    stderr?: string;
                };
                stdout = execErr.stdout ?? "";
                stderr = execErr.stderr ?? "";
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

    describe("given a repository with a valid Claude Code skill in .claude/skills/", () => {
        it("should pass lint without errors", async () => {
            // Arrange
            const repoDir = join(projectDir, "claude-valid-repo");
            const skillDir = join(repoDir, ".claude", "skills", "explain-code");
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                [
                    "---",
                    "name: explain-code",
                    "description: Explains code with visual diagrams and analogies",
                    "allowed-tools: Read, Grep",
                    "---",
                    "",
                    "# explain-code",
                    "",
                    "When explaining code, always include an analogy and a diagram.",
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
            expect(process.exitCode).toBeUndefined();
        });
    });

    describe("given a repository with an invalid Claude Code skill in .claude/skills/", () => {
        it("should set non-zero exit code for missing required fields", async () => {
            // Arrange
            const repoDir = join(projectDir, "claude-invalid-repo");
            const skillDir = join(repoDir, ".claude", "skills", "broken-skill");
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

    describe("given a repository with skills in both .github/skills/ and .claude/skills/", () => {
        it("should lint skills from both directories and pass when all are valid", async () => {
            // Arrange
            const repoDir = join(projectDir, "both-dirs-valid-repo");
            const copilotSkillDir = join(
                repoDir,
                ".github",
                "skills",
                "copilot-skill",
            );
            const claudeSkillDir = join(
                repoDir,
                ".claude",
                "skills",
                "claude-skill",
            );
            await mkdir(copilotSkillDir, { recursive: true });
            await mkdir(claudeSkillDir, { recursive: true });
            await writeFile(
                join(copilotSkillDir, "SKILL.md"),
                [
                    "---",
                    "name: copilot-skill",
                    "description: A Copilot skill",
                    "allowed-tools: tool1",
                    "---",
                    "",
                    "# copilot-skill",
                    "",
                ].join("\n"),
            );
            await writeFile(
                join(claudeSkillDir, "SKILL.md"),
                [
                    "---",
                    "name: claude-skill",
                    "description: A Claude Code skill",
                    "allowed-tools: Read",
                    "---",
                    "",
                    "# claude-skill",
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
            expect(process.exitCode).toBeUndefined();
        });

        it("should set non-zero exit code when any skill in either directory is invalid", async () => {
            // Arrange
            const repoDir = join(projectDir, "both-dirs-mixed-repo");
            const copilotSkillDir = join(
                repoDir,
                ".github",
                "skills",
                "good-copilot-skill",
            );
            const claudeSkillDir = join(
                repoDir,
                ".claude",
                "skills",
                "bad-claude-skill",
            );
            await mkdir(copilotSkillDir, { recursive: true });
            await mkdir(claudeSkillDir, { recursive: true });
            await writeFile(
                join(copilotSkillDir, "SKILL.md"),
                [
                    "---",
                    "name: good-copilot-skill",
                    "description: A valid Copilot skill",
                    "allowed-tools: tool1",
                    "---",
                    "",
                    "# good-copilot-skill",
                    "",
                ].join("\n"),
            );
            await writeFile(
                join(claudeSkillDir, "SKILL.md"),
                ["# No frontmatter", "", "Invalid skill.", ""].join("\n"),
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

    describe("given a repository with instruction files and feedback loops", () => {
        it("should analyze instruction quality with --instructions flag", async () => {
            // Arrange
            const repoDir = join(projectDir, "instruction-quality-repo");
            const githubDir = join(repoDir, ".github");
            await mkdir(githubDir, { recursive: true });
            await writeFile(
                join(githubDir, "copilot-instructions.md"),
                [
                    "## Validation",
                    "",
                    "```bash",
                    "npm test",
                    "```",
                    "",
                    "If tests fail, fix the failing assertions.",
                    "",
                ].join("\n"),
            );
            await writeFile(
                join(repoDir, "package.json"),
                JSON.stringify({
                    scripts: {
                        test: "vitest run",
                        build: "rspack build",
                    },
                }),
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [], instructions: true },
                    cmd: lintCommand,
                    data: { targetDir: repoDir, instructions: true },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("given a repository with no instruction files", () => {
        it("should complete without error with --instructions flag", async () => {
            // Arrange
            const repoDir = join(projectDir, "no-instructions-repo");
            await mkdir(repoDir, { recursive: true });

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [], instructions: true },
                    cmd: lintCommand,
                    data: { targetDir: repoDir, instructions: true },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("given a repository with multiple instruction file formats", () => {
        it("should discover and analyze all instruction files", async () => {
            // Arrange
            const repoDir = join(projectDir, "multi-format-repo");
            const githubDir = join(repoDir, ".github");
            const agentsDir = join(repoDir, ".github", "agents");
            await mkdir(agentsDir, { recursive: true });
            const instructionFiles = [
                {
                    path: join(githubDir, "copilot-instructions.md"),
                    content: "# Instructions\n\nRun `npm test`.\n",
                },
                {
                    path: join(agentsDir, "reviewer.md"),
                    content: "---\nname: reviewer\n---\n# Reviewer\n",
                },
                {
                    path: join(repoDir, "CLAUDE.md"),
                    content: "# Claude\n\nRun `npm test`.\n",
                },
                {
                    path: join(repoDir, "AGENTS.md"),
                    content: "# Agents\n\nRun `npm test`.\n",
                },
            ];
            for (const file of instructionFiles) {
                await writeFile(file.path, file.content);
            }
            await writeFile(
                join(repoDir, "package.json"),
                JSON.stringify({
                    scripts: { test: "vitest run" },
                }),
            );

            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [], instructions: true },
                    cmd: lintCommand,
                    data: { targetDir: repoDir, instructions: true },
                }),
            ).resolves.not.toThrow();
        });
    });
});
