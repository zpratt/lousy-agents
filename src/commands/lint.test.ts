import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lintCommand } from "./lint.js";

const chance = new Chance();

describe("lint command", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-lint-cmd-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        process.exitCode = undefined;
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

    describe("when running with --instructions flag", () => {
        describe("when no instruction files exist", () => {
            it("should complete without error", async () => {
                // Act & Assert
                await expect(
                    lintCommand.run({
                        rawArgs: [],
                        args: { _: [], instructions: true },
                        cmd: lintCommand,
                        data: { targetDir: testDir, instructions: true },
                    }),
                ).resolves.not.toThrow();
            });
        });

        describe("when instruction files exist with well-documented commands", () => {
            it("should complete without error", async () => {
                // Arrange
                const githubDir = join(testDir, ".github");
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
                        "If tests fail, fix them.",
                        "",
                    ].join("\n"),
                );
                await writeFile(
                    join(testDir, "package.json"),
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
                        data: { targetDir: testDir, instructions: true },
                    }),
                ).resolves.not.toThrow();
            });
        });

        describe("when instruction files exist with --format json", () => {
            it("should complete without error", async () => {
                // Arrange
                await writeFile(join(testDir, "AGENTS.md"), "# Agents\n");

                // Act & Assert
                await expect(
                    lintCommand.run({
                        rawArgs: [],
                        args: {
                            _: [],
                            instructions: true,
                            format: "json",
                        },
                        cmd: lintCommand,
                        data: {
                            targetDir: testDir,
                            instructions: true,
                            format: "json",
                        },
                    }),
                ).resolves.not.toThrow();
            });
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

    describe("when target directory contains path traversal", () => {
        it("should reject the directory", async () => {
            // Act & Assert
            await expect(
                lintCommand.run({
                    rawArgs: [],
                    args: { _: [], skills: true },
                    cmd: lintCommand,
                    data: {
                        targetDir: "/tmp/../etc/passwd",
                        skills: true,
                    },
                }),
            ).rejects.toThrow("path traversal");
        });
    });

    describe("when lint config sets a rule to off", () => {
        it("should suppress diagnostics for that rule", async () => {
            // Arrange
            const skillDir = join(testDir, ".github", "skills", "my-skill");
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "---\nname: my-skill\ndescription: A test skill\n---\n# My Skill\n",
            );
            await writeFile(
                join(testDir, "lousy-agents.config.ts"),
                `export default {
                    lint: {
                        rules: {
                            skills: {
                                "skill/missing-allowed-tools": "off",
                            },
                        },
                    },
                };`,
            );

            // Act - use JSON format to capture and verify diagnostics
            const writeSpy = vi
                .spyOn(process.stdout, "write")
                .mockImplementation(() => true);

            let capturedCalls: unknown[][] = [];
            try {
                await lintCommand.run({
                    rawArgs: [],
                    args: { _: [], skills: true, format: "json" },
                    cmd: lintCommand,
                    data: {
                        targetDir: testDir,
                        skills: true,
                        format: "json",
                    },
                });
                capturedCalls = [...writeSpy.mock.calls];
            } finally {
                writeSpy.mockRestore();
            }

            // Assert - JSON formatter outputs a flat array of LintDiagnostic objects
            const jsonOutput = capturedCalls
                .map((call) => String(call[0]))
                .join("");
            const diagnostics = JSON.parse(jsonOutput) as {
                target: string;
                ruleId?: string;
            }[];
            const offRuleDiagnostics = diagnostics.filter(
                (d) =>
                    d.target === "skill" &&
                    d.ruleId === "skill/missing-allowed-tools",
            );
            expect(offRuleDiagnostics).toHaveLength(0);
            expect(process.exitCode).toBeUndefined();
        });
    });

    describe("when lint config demotes an error to warn", () => {
        it("should exit with code 0 when only warnings remain", async () => {
            // Arrange - skill with missing name (normally an error)
            const skillDir = join(testDir, ".github", "skills", "my-skill");
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "---\ndescription: Missing name field\n---\n# my-skill\n",
            );
            await writeFile(
                join(testDir, "lousy-agents.config.ts"),
                `export default {
                    lint: {
                        rules: {
                            skills: {
                                "skill/missing-name": "warn",
                                "skill/missing-allowed-tools": "off",
                            },
                        },
                    },
                };`,
            );

            // Act
            await lintCommand.run({
                rawArgs: [],
                args: { _: [], skills: true },
                cmd: lintCommand,
                data: { targetDir: testDir, skills: true },
            });

            // Assert - should pass with warnings only
            expect(process.exitCode).toBeUndefined();
        });
    });

    describe("when lint config has an invalid severity value", () => {
        it("should exit with code 1 and log an error", async () => {
            // Arrange
            await writeFile(
                join(testDir, "lousy-agents.config.ts"),
                `export default {
                    lint: {
                        rules: {
                            skills: {
                                "skill/missing-name": "fatal",
                            },
                        },
                    },
                };`,
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

    describe("when instruction rule is set to off", () => {
        it("should suppress corresponding instruction diagnostics and suggestions", async () => {
            // Arrange - instruction file with command not in code block
            const githubDir = join(testDir, ".github");
            await mkdir(githubDir, { recursive: true });
            await writeFile(
                join(githubDir, "copilot-instructions.md"),
                ["## Validation", "", "Run npm test to validate.", ""].join(
                    "\n",
                ),
            );
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify({ scripts: { test: "vitest run" } }),
            );
            await writeFile(
                join(testDir, "lousy-agents.config.ts"),
                `export default {
                    lint: {
                        rules: {
                            instructions: {
                                "instruction/command-not-in-code-block": "off",
                                "instruction/missing-error-handling": "off",
                            },
                        },
                    },
                };`,
            );

            // Act - capture consola.warn calls to verify suggestion suppression
            const { consola } = await import("consola");
            const warnSpy = vi
                .spyOn(consola, "warn")
                .mockImplementation(() => {});
            const infoSpy = vi
                .spyOn(consola, "info")
                .mockImplementation(() => {});
            const errorSpy = vi
                .spyOn(consola, "error")
                .mockImplementation(() => {});

            try {
                await lintCommand.run({
                    rawArgs: [],
                    args: { _: [], instructions: true },
                    cmd: lintCommand,
                    data: {
                        targetDir: testDir,
                        instructions: true,
                    },
                });

                // Assert - suggestions for off rules should not be logged
                const warnMessages = warnSpy.mock.calls.map((call) =>
                    String(call[0]),
                );
                const suppressedWarnings = warnMessages.filter(
                    (msg) =>
                        msg.includes("not in code blocks") ||
                        msg.includes("missing error handling guidance"),
                );
                expect(suppressedWarnings).toHaveLength(0);
            } finally {
                warnSpy.mockRestore();
                infoSpy.mockRestore();
                errorSpy.mockRestore();
            }
        });
    });
});
