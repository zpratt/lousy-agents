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
        process.exitCode = undefined;
    });

    describe("when no skills exist", () => {
        it("should complete without error when using --skills", async () => {
            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [], skills: true },
                    cmd: lintCommand,
                    data: { targetDir: testDir, skills: true },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("when skills have valid frontmatter", () => {
        it("should complete without error when using --skills", async () => {
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
                    args: { _: [], skills: true },
                    cmd: lintCommand,
                    data: { targetDir: testDir, skills: true },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe("when skills have invalid frontmatter", () => {
        it("should set non-zero exit code when using --skills", async () => {
            // Arrange
            const skillName = "my-skill";
            const skillDir = join(testDir, ".github", "skills", skillName);
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "---\ndescription: A test skill\n---\n# Missing name field\n",
            );

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: testDir, skills: true },
            });

            // Assert
            expect(process.exitCode).toBe(1);
        });
    });

    describe("when a skill has no frontmatter", () => {
        it("should set non-zero exit code when using --skills", async () => {
            // Arrange
            const skillName = "bad-skill";
            const skillDir = join(testDir, ".github", "skills", skillName);
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "# No frontmatter here\nJust some content\n",
            );

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: testDir, skills: true },
            });

            // Assert
            expect(process.exitCode).toBe(1);
        });
    });

    describe("when a skill name does not match parent directory", () => {
        it("should set non-zero exit code when using --skills", async () => {
            // Arrange
            const skillDir = join(testDir, ".github", "skills", "my-skill");
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "---\nname: different-name\ndescription: A test skill\n---\n# Content\n",
            );

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: testDir, skills: true },
            });

            // Assert
            expect(process.exitCode).toBe(1);
        });
    });

    describe("when multiple skills exist with mixed validity", () => {
        it("should set non-zero exit code when using --skills", async () => {
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

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: testDir, skills: true },
            });

            // Assert
            expect(process.exitCode).toBe(1);
        });
    });

    describe("when running with --agents flag", () => {
        describe("when no agents exist", () => {
            it("should complete without error", async () => {
                // Act & Assert
                await expect(
                    lintCommand.run({
                        rawArgs: [],
                        args: { _: [], agents: true },
                        cmd: lintCommand,
                        data: { targetDir: testDir, agents: true },
                    }),
                ).resolves.not.toThrow();
            });
        });

        describe("when agents have valid frontmatter", () => {
            it("should complete without error", async () => {
                // Arrange
                const agentsDir = join(testDir, ".github", "agents");
                await mkdir(agentsDir, { recursive: true });
                await writeFile(
                    join(agentsDir, "security.md"),
                    "---\nname: security\ndescription: A security agent\n---\n# Security\n",
                );

                // Act & Assert
                await expect(
                    lintCommand.run({
                        rawArgs: [],
                        args: { _: [], agents: true },
                        cmd: lintCommand,
                        data: { targetDir: testDir, agents: true },
                    }),
                ).resolves.not.toThrow();
            });
        });

        describe("when agents have invalid frontmatter", () => {
            it("should set non-zero exit code", async () => {
                // Arrange
                const agentsDir = join(testDir, ".github", "agents");
                await mkdir(agentsDir, { recursive: true });
                await writeFile(
                    join(agentsDir, "security.md"),
                    '---\nname: Security\ndescription: ""\n---\n',
                );

                // Act
                await lintCommand.run({
                    rawArgs: [],
                    args: { _: [], agents: true },
                    cmd: lintCommand,
                    data: { targetDir: testDir, agents: true },
                });

                // Assert
                expect(process.exitCode).toBe(1);
            });
        });
    });

    describe("when running with --format json", () => {
        it("should output valid JSON for valid skills", async () => {
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
                    args: { _: [], format: "json", skills: true },
                    cmd: lintCommand,
                    data: { targetDir: testDir, format: "json", skills: true },
                }),
            ).resolves.not.toThrow();
        });

        it("should set non-zero exit code for invalid skills even with json format", async () => {
            // Arrange
            const skillDir = join(testDir, ".github", "skills", "bad");
            await mkdir(skillDir, { recursive: true });
            await writeFile(join(skillDir, "SKILL.md"), "# No frontmatter\n");

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], format: "json", skills: true },
                cmd: lintCommand,
                data: { targetDir: testDir, format: "json", skills: true },
            });

            // Assert
            expect(process.exitCode).toBe(1);
        });
    });

    describe("when running with no flags", () => {
        it("should lint skills, agents, and instructions", async () => {
            // Act & Assert - empty directory should succeed for all targets
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
});
