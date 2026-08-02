import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { subagentDirectoryRoots } from "../lib/agentic-location-matchers.js";
import { FileSystemSubagentLintGateway } from "./subagent-lint-gateway.js";

const chance = new Chance();

describe("FileSystemSubagentLintGateway", () => {
    let testDir: string;
    let gateway: FileSystemSubagentLintGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-subagent-lint-gw-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemSubagentLintGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("discoverSubagents", () => {
        describe("when .claude/agents/ does not exist", () => {
            it("should return an empty array", async () => {
                // Act
                const subagents = await gateway.discoverSubagents(testDir);

                // Assert
                expect(subagents).toEqual([]);
            });
        });

        describe("when .claude/agents/ contains markdown files", () => {
            it("should discover subagent files with correct names", async () => {
                // Arrange
                const subagentsDir = join(testDir, ".claude", "agents");
                await mkdir(subagentsDir, { recursive: true });
                await writeFile(
                    join(subagentsDir, "reviewer.md"),
                    "---\nname: reviewer\ndescription: test\n---\n",
                );
                await writeFile(
                    join(subagentsDir, "planner.md"),
                    "---\nname: planner\ndescription: test\n---\n",
                );

                // Act
                const subagents = await gateway.discoverSubagents(testDir);

                // Assert
                expect(subagents).toHaveLength(2);
                const names = subagents.map((a) => a.subagentName).sort();
                expect(names).toEqual(["planner", "reviewer"]);
            });
        });

        describe("when .claude/agents/ contains subdirectories with markdown files", () => {
            it("should discover subagent files in nested directories", async () => {
                // Arrange
                const subagentsDir = join(testDir, ".claude", "agents");
                const teamDir = join(subagentsDir, "team");
                await mkdir(teamDir, { recursive: true });
                await writeFile(
                    join(subagentsDir, "reviewer.md"),
                    "---\nname: reviewer\ndescription: test\n---\n",
                );
                await writeFile(
                    join(teamDir, "planner.md"),
                    "---\nname: planner\ndescription: test\n---\n",
                );

                // Act
                const subagents = await gateway.discoverSubagents(testDir);

                // Assert
                expect(subagents).toHaveLength(2);
                const names = subagents.map((a) => a.subagentName).sort();
                expect(names).toEqual(["planner", "reviewer"]);
            });
        });

        describe("when .claude/agents/ contains non-markdown files", () => {
            it("should skip non-markdown files", async () => {
                // Arrange
                const subagentsDir = join(testDir, ".claude", "agents");
                await mkdir(subagentsDir, { recursive: true });
                await writeFile(
                    join(subagentsDir, "reviewer.md"),
                    "---\nname: reviewer\n---\n",
                );
                await writeFile(
                    join(subagentsDir, "config.json"),
                    '{ "key": "value" }',
                );

                // Act
                const subagents = await gateway.discoverSubagents(testDir);

                // Assert
                expect(subagents).toHaveLength(1);
                expect(subagents[0].subagentName).toBe("reviewer");
            });
        });

        describe("when subagents exist under every catalog subagent root", () => {
            it("should discover markdown from all subagentDirectoryRoots()", async () => {
                // Arrange
                const expectedNames: string[] = [];
                for (const [
                    index,
                    root,
                ] of subagentDirectoryRoots().entries()) {
                    const subagentName = `catalog-subagent-${index}`;
                    expectedNames.push(subagentName);
                    const subagentsDir = join(testDir, ...root.split("/"));
                    await mkdir(subagentsDir, { recursive: true });
                    await writeFile(
                        join(subagentsDir, `${subagentName}.md`),
                        `---\nname: ${subagentName}\ndescription: test\n---\n`,
                    );
                }

                // Act
                const subagents = await gateway.discoverSubagents(testDir);

                // Assert
                expect(subagents).toHaveLength(expectedNames.length);
                const names = subagents.map((a) => a.subagentName).sort();
                expect(names).toEqual([...expectedNames].sort());
            });
        });
    });

    describe("parseFrontmatter", () => {
        describe("when content has valid YAML frontmatter", () => {
            it("should return parsed data with field line numbers", () => {
                // Arrange
                const content =
                    "---\nname: reviewer\ndescription: A reviewer subagent\n---\n# Content\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result).not.toBeNull();
                expect(result?.data).toEqual({
                    name: "reviewer",
                    description: "A reviewer subagent",
                });
                expect(result?.fieldLines.get("name")).toBe(2);
                expect(result?.fieldLines.get("description")).toBe(3);
            });
        });

        describe("when content has no frontmatter", () => {
            it("should return null", () => {
                // Arrange
                const content = "# No frontmatter\nJust content\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result).toBeNull();
            });
        });
    });

    describe("readSubagentFileContent", () => {
        it("should read file content as UTF-8", async () => {
            // Arrange
            const subagentsDir = join(testDir, ".claude", "agents");
            await mkdir(subagentsDir, { recursive: true });
            const expectedContent = "---\nname: test\ndescription: test\n---\n";
            const filePath = join(subagentsDir, "test.md");
            await writeFile(filePath, expectedContent);

            // Act
            const content = await gateway.readSubagentFileContent(filePath);

            // Assert
            expect(content).toBe(expectedContent);
        });

        describe("given a symbolic link file", () => {
            it.skipIf(process.platform === "win32")(
                "should reject with an error identifying the symlink",
                async () => {
                    // Arrange
                    const subagentsDir = join(testDir, ".claude", "agents");
                    await mkdir(subagentsDir, { recursive: true });
                    const realFile = join(subagentsDir, "real-subagent.md");
                    const linkFile = join(subagentsDir, "link-subagent.md");
                    await writeFile(
                        realFile,
                        "---\nname: test\ndescription: test\n---\n",
                    );
                    await symlink(realFile, linkFile);

                    // Act & Assert
                    await expect(
                        gateway.readSubagentFileContent(linkFile),
                    ).rejects.toThrow("Symlinks are not allowed");
                },
            );
        });

        describe("given a file exceeding the size limit", () => {
            it("should reject with a size limit error", async () => {
                // Arrange — write a file just over 1 MB
                const subagentsDir = join(testDir, ".claude", "agents");
                await mkdir(subagentsDir, { recursive: true });
                const filePath = join(subagentsDir, "huge-subagent.md");
                const oversizeContent = "x".repeat(1_048_576 + 1);
                await writeFile(filePath, oversizeContent);

                // Act & Assert
                await expect(
                    gateway.readSubagentFileContent(filePath),
                ).rejects.toThrow("exceeds size limit");
            });
        });
    });
});
