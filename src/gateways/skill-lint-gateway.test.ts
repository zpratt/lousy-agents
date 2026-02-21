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
    });
});
