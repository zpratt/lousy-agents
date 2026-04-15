import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemSkillLintGateway } from "./skill-lint-gateway.js";

const chance = new Chance();

describe("SkillLintGateway", () => {
    let testDir: string;
    let gateway: FileSystemSkillLintGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-skill-lint-gw-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemSkillLintGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("discoverSkills", () => {
        describe("given a directory with skill files", () => {
            it("should discover all SKILL.md files", async () => {
                // Arrange
                const skillName = "my-skill";
                const skillDir = join(testDir, ".github", "skills", skillName);
                await mkdir(skillDir, { recursive: true });
                await writeFile(
                    join(skillDir, "SKILL.md"),
                    "---\nname: my-skill\n---\n",
                );

                // Act
                const result = await gateway.discoverSkills(testDir);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].skillName).toBe(skillName);
                expect(result[0].filePath).toBe(join(skillDir, "SKILL.md"));
            });
        });

        describe("given multiple skills", () => {
            it("should discover all skill files", async () => {
                // Arrange
                const skill1 = "skill-alpha";
                const skill2 = "skill-beta";
                const dir1 = join(testDir, ".github", "skills", skill1);
                const dir2 = join(testDir, ".github", "skills", skill2);
                await mkdir(dir1, { recursive: true });
                await mkdir(dir2, { recursive: true });
                await writeFile(
                    join(dir1, "SKILL.md"),
                    "---\nname: skill-alpha\n---\n",
                );
                await writeFile(
                    join(dir2, "SKILL.md"),
                    "---\nname: skill-beta\n---\n",
                );

                // Act
                const result = await gateway.discoverSkills(testDir);

                // Assert
                expect(result).toHaveLength(2);
                const names = result.map((s) => s.skillName).sort();
                expect(names).toEqual([skill1, skill2]);
            });
        });

        describe("given a directory without skills", () => {
            it("should return an empty array", async () => {
                // Act
                const result = await gateway.discoverSkills(testDir);

                // Assert
                expect(result).toEqual([]);
            });
        });

        describe("given a skill directory without SKILL.md", () => {
            it("should not include the directory", async () => {
                // Arrange
                const skillDir = join(
                    testDir,
                    ".github",
                    "skills",
                    "empty-skill",
                );
                await mkdir(skillDir, { recursive: true });

                // Act
                const result = await gateway.discoverSkills(testDir);

                // Assert
                expect(result).toEqual([]);
            });
        });

        describe("given a directory name with path traversal characters", () => {
            it("should skip the directory", async () => {
                // Arrange
                const skillDir = join(
                    testDir,
                    ".github",
                    "skills",
                    "..%2f..%2fetc",
                );
                await mkdir(skillDir, { recursive: true });
                await writeFile(
                    join(skillDir, "SKILL.md"),
                    "---\nname: test\n---\n",
                );

                // Act
                const result = await gateway.discoverSkills(testDir);

                // Assert - directory name contains ".." so it is skipped by the path traversal guard
                expect(result).toEqual([]);
            });
        });

        describe("given skills in .claude/skills/", () => {
            it("should discover Claude Code skill files", async () => {
                // Arrange
                const skillName = "claude-skill";
                const skillDir = join(testDir, ".claude", "skills", skillName);
                await mkdir(skillDir, { recursive: true });
                await writeFile(
                    join(skillDir, "SKILL.md"),
                    "---\nname: claude-skill\n---\n",
                );

                // Act
                const result = await gateway.discoverSkills(testDir);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].skillName).toBe(skillName);
                expect(result[0].filePath).toBe(join(skillDir, "SKILL.md"));
            });
        });

        describe("given skills in both .github/skills/ and .claude/skills/", () => {
            it("should discover skills from both directories", async () => {
                // Arrange
                const copilotSkill = "copilot-skill";
                const claudeSkill = "claude-skill";
                const copilotDir = join(
                    testDir,
                    ".github",
                    "skills",
                    copilotSkill,
                );
                const claudeDir = join(
                    testDir,
                    ".claude",
                    "skills",
                    claudeSkill,
                );
                await mkdir(copilotDir, { recursive: true });
                await mkdir(claudeDir, { recursive: true });
                await writeFile(
                    join(copilotDir, "SKILL.md"),
                    "---\nname: copilot-skill\n---\n",
                );
                await writeFile(
                    join(claudeDir, "SKILL.md"),
                    "---\nname: claude-skill\n---\n",
                );

                // Act
                const result = await gateway.discoverSkills(testDir);

                // Assert
                expect(result).toHaveLength(2);
                const names = result.map((s) => s.skillName).sort();
                expect(names).toEqual([claudeSkill, copilotSkill]);
            });
        });

        describe("given a .claude/skills/ directory with path traversal characters", () => {
            it("should skip the directory", async () => {
                // Arrange
                const skillDir = join(
                    testDir,
                    ".claude",
                    "skills",
                    "..%2f..%2fetc",
                );
                await mkdir(skillDir, { recursive: true });
                await writeFile(
                    join(skillDir, "SKILL.md"),
                    "---\nname: test\n---\n",
                );

                // Act
                const result = await gateway.discoverSkills(testDir);

                // Assert
                expect(result).toEqual([]);
            });
        });
        describe("given a skills directory that is a symbolic link", () => {
            it.skipIf(process.platform === "win32")(
                "should skip the symlinked directory and return no skills",
                async () => {
                    // Arrange — create a real skills dir, populate it, then symlink it
                    const realSkillsDir = join(testDir, "real-skills");
                    const skillDir = join(realSkillsDir, "my-skill");
                    await mkdir(skillDir, { recursive: true });
                    await writeFile(
                        join(skillDir, "SKILL.md"),
                        "---\nname: my-skill\n---\n",
                    );

                    // Create .github with symlink to the real skills dir
                    const githubDir = join(testDir, ".github");
                    await mkdir(githubDir, { recursive: true });

                    const { symlink, rm: rmFs } = await import(
                        "node:fs/promises"
                    );
                    const symlinkPath = join(githubDir, "skills");
                    try {
                        await symlink(realSkillsDir, symlinkPath);

                        // Act
                        const result = await gateway.discoverSkills(testDir);

                        // Assert — symlinked skills directory is silently skipped
                        expect(result).toEqual([]);
                    } finally {
                        await rmFs(symlinkPath, { force: true });
                    }
                },
            );
        });
    });

    describe("readSkillFileContent", () => {
        describe("given a valid file path", () => {
            it("should return the file content", async () => {
                // Arrange
                const content =
                    "---\nname: test\ndescription: A test skill\n---\n# Test\n";
                const filePath = join(testDir, "SKILL.md");
                await writeFile(filePath, content);

                // Act
                const result = await gateway.readSkillFileContent(filePath);

                // Assert
                expect(result).toBe(content);
            });
        });

        describe("given a symbolic link file path", () => {
            it.skipIf(process.platform === "win32")(
                "should reject with an error identifying the symlink",
                async () => {
                    // Arrange — create a real file and a symlink pointing to it
                    const { symlink, rm: rmFs } = await import(
                        "node:fs/promises"
                    );
                    const realFile = join(testDir, "real-SKILL.md");
                    const linkFile = join(testDir, "SKILL.md");
                    await writeFile(
                        realFile,
                        "---\nname: test\ndescription: A test skill\n---\n",
                    );

                    try {
                        await symlink(realFile, linkFile);

                        // Act & Assert
                        await expect(
                            gateway.readSkillFileContent(linkFile),
                        ).rejects.toThrow("Symlinks are not allowed");
                    } finally {
                        await rmFs(linkFile, { force: true });
                    }
                },
            );
        });

        describe("given a file exceeding the size limit", () => {
            it("should reject with a size limit error", async () => {
                // Arrange — write a file just over 1 MB
                const filePath = join(testDir, "SKILL.md");
                const oversizeContent = "x".repeat(1_048_576 + 1);
                await writeFile(filePath, oversizeContent);

                // Act & Assert
                await expect(
                    gateway.readSkillFileContent(filePath),
                ).rejects.toThrow("exceeds size limit");
            });
        });
    });

    describe("parseFrontmatter", () => {
        describe("given content with valid YAML frontmatter", () => {
            it("should parse the frontmatter data", () => {
                // Arrange
                const content =
                    "---\nname: my-skill\ndescription: A skill\n---\n# Content\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result).not.toBeNull();
                expect(result?.data.name).toBe("my-skill");
                expect(result?.data.description).toBe("A skill");
            });

            it("should track field line numbers", () => {
                // Arrange
                const content =
                    "---\nname: my-skill\ndescription: A skill\n---\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result?.fieldLines.get("name")).toBe(2);
                expect(result?.fieldLines.get("description")).toBe(3);
            });

            it("should set frontmatterStartLine to 1", () => {
                // Arrange
                const content = "---\nname: my-skill\n---\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result?.frontmatterStartLine).toBe(1);
            });
        });

        describe("given content without frontmatter", () => {
            it("should return null", () => {
                // Arrange
                const content = "# Just a heading\nSome content\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe("given content with unclosed frontmatter", () => {
            it("should return null", () => {
                // Arrange
                const content = "---\nname: my-skill\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe("given content with hyphenated field names", () => {
            it("should track line numbers for hyphenated fields", () => {
                // Arrange
                const content =
                    "---\nname: my-skill\nallowed-tools: tool1\n---\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result?.fieldLines.get("allowed-tools")).toBe(3);
                expect(result?.data["allowed-tools"]).toBe("tool1");
            });
        });

        describe("given content with invalid YAML", () => {
            it("should return null instead of throwing", () => {
                // Arrange
                const content = "---\n: invalid:\n  - :\n---\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe("given frontmatter that parses to a non-object value", () => {
            it("should return an empty data object", () => {
                // Arrange - YAML that parses to a string, not an object
                const content = "---\njust a string\n---\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result).not.toBeNull();
                expect(result?.data).toEqual({});
            });
        });
    });
});
