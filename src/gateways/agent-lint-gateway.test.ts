import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemAgentLintGateway } from "./agent-lint-gateway.js";

const chance = new Chance();

describe("FileSystemAgentLintGateway", () => {
    let testDir: string;
    let gateway: FileSystemAgentLintGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-agent-lint-gw-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemAgentLintGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("discoverAgents", () => {
        describe("when .github/agents/ does not exist", () => {
            it("should return an empty array", async () => {
                // Act
                const agents = await gateway.discoverAgents(testDir);

                // Assert
                expect(agents).toEqual([]);
            });
        });

        describe("when .github/agents/ contains markdown files", () => {
            it("should discover agent files with correct names", async () => {
                // Arrange
                const agentsDir = join(testDir, ".github", "agents");
                await mkdir(agentsDir, { recursive: true });
                await writeFile(
                    join(agentsDir, "security.md"),
                    "---\nname: security\ndescription: test\n---\n",
                );
                await writeFile(
                    join(agentsDir, "reviewer.md"),
                    "---\nname: reviewer\ndescription: test\n---\n",
                );

                // Act
                const agents = await gateway.discoverAgents(testDir);

                // Assert
                expect(agents).toHaveLength(2);
                const names = agents.map((a) => a.agentName).sort();
                expect(names).toEqual(["reviewer", "security"]);
            });
        });

        describe("when .github/agents/ contains non-markdown files", () => {
            it("should skip non-markdown files", async () => {
                // Arrange
                const agentsDir = join(testDir, ".github", "agents");
                await mkdir(agentsDir, { recursive: true });
                await writeFile(
                    join(agentsDir, "security.md"),
                    "---\nname: security\n---\n",
                );
                await writeFile(
                    join(agentsDir, "config.json"),
                    '{ "key": "value" }',
                );

                // Act
                const agents = await gateway.discoverAgents(testDir);

                // Assert
                expect(agents).toHaveLength(1);
                expect(agents[0].agentName).toBe("security");
            });
        });
    });

    describe("parseFrontmatter", () => {
        describe("when content has valid YAML frontmatter", () => {
            it("should return parsed data with field line numbers", () => {
                // Arrange
                const content =
                    "---\nname: security\ndescription: A security agent\n---\n# Content\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result).not.toBeNull();
                expect(result?.data).toEqual({
                    name: "security",
                    description: "A security agent",
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

        describe("when content has invalid YAML", () => {
            it("should return null", () => {
                // Arrange
                const content = "---\n- :\n  - : [\n---\n";

                // Act
                const result = gateway.parseFrontmatter(content);

                // Assert
                expect(result).toBeNull();
            });
        });
    });

    describe("readAgentFileContent", () => {
        it("should read file content as UTF-8", async () => {
            // Arrange
            const agentsDir = join(testDir, ".github", "agents");
            await mkdir(agentsDir, { recursive: true });
            const expectedContent =
                "---\nname: test\ndescription: test\n---\n";
            const filePath = join(agentsDir, "test.md");
            await writeFile(filePath, expectedContent);

            // Act
            const content = await gateway.readAgentFileContent(filePath);

            // Assert
            expect(content).toBe(expectedContent);
        });
    });
});
