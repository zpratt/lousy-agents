import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newCommand } from "./new.js";

const chance = new Chance();

describe("new command", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-new-cmd-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when creating a copilot agent", () => {
        it("should create an agent file at .github/agents/<name>.md", async () => {
            // Arrange
            const agentName = "security";

            // Act
            await newCommand.run({
                rawArgs: ["--copilot-agent", agentName],
                args: { _: [], "copilot-agent": agentName },
                cmd: newCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const agentFile = join(
                testDir,
                ".github",
                "agents",
                `${agentName}.md`,
            );
            const content = await readFile(agentFile, "utf-8");
            expect(content).toContain("name: security");
        });

        it("should normalize agent names with spaces to kebab-case", async () => {
            // Arrange
            const agentName = "Test Specialist";

            // Act
            await newCommand.run({
                rawArgs: ["--copilot-agent", agentName],
                args: { _: [], "copilot-agent": agentName },
                cmd: newCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const agentFile = join(
                testDir,
                ".github",
                "agents",
                "test-specialist.md",
            );
            const content = await readFile(agentFile, "utf-8");
            expect(content).toContain("name: test-specialist");
        });

        it("should create the .github/agents directory if it does not exist", async () => {
            // Arrange
            const agentName = chance.word();
            const agentsDir = join(testDir, ".github", "agents");

            // Act
            await newCommand.run({
                rawArgs: ["--copilot-agent", agentName],
                args: { _: [], "copilot-agent": agentName },
                cmd: newCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const stat = await import("node:fs/promises").then((fs) =>
                fs.stat(agentsDir),
            );
            expect(stat.isDirectory()).toBe(true);
        });

        it("should include YAML frontmatter with name and description", async () => {
            // Arrange
            const agentName = chance.word();

            // Act
            await newCommand.run({
                rawArgs: ["--copilot-agent", agentName],
                args: { _: [], "copilot-agent": agentName },
                cmd: newCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const agentFile = join(
                testDir,
                ".github",
                "agents",
                `${agentName}.md`,
            );
            const content = await readFile(agentFile, "utf-8");
            expect(content).toContain("---");
            expect(content).toContain("name:");
            expect(content).toContain("description:");
        });

        it("should include a documentation link comment", async () => {
            // Arrange
            const agentName = chance.word();

            // Act
            await newCommand.run({
                rawArgs: ["--copilot-agent", agentName],
                args: { _: [], "copilot-agent": agentName },
                cmd: newCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const agentFile = join(
                testDir,
                ".github",
                "agents",
                `${agentName}.md`,
            );
            const content = await readFile(agentFile, "utf-8");
            expect(content).toContain(
                "https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents",
            );
        });
    });

    describe("when the agent file already exists", () => {
        it("should throw an error", async () => {
            // Arrange
            const agentName = "security";
            const agentsDir = join(testDir, ".github", "agents");
            await mkdir(agentsDir, { recursive: true });
            const agentFile = join(agentsDir, `${agentName}.md`);
            await import("node:fs/promises").then((fs) =>
                fs.writeFile(agentFile, "existing content"),
            );

            // Act & Assert
            await expect(
                newCommand.run({
                    rawArgs: ["--copilot-agent", agentName],
                    args: { _: [], "copilot-agent": agentName },
                    cmd: newCommand,
                    data: { targetDir: testDir },
                }),
            ).rejects.toThrow("already exists");
        });

        it("should not modify the existing file", async () => {
            // Arrange
            const agentName = "security";
            const agentsDir = join(testDir, ".github", "agents");
            await mkdir(agentsDir, { recursive: true });
            const agentFile = join(agentsDir, `${agentName}.md`);
            const existingContent = chance.paragraph();
            await import("node:fs/promises").then((fs) =>
                fs.writeFile(agentFile, existingContent),
            );

            // Act
            try {
                await newCommand.run({
                    rawArgs: ["--copilot-agent", agentName],
                    args: { _: [], "copilot-agent": agentName },
                    cmd: newCommand,
                    data: { targetDir: testDir },
                });
            } catch {
                // Expected to throw
            }

            // Assert
            const content = await readFile(agentFile, "utf-8");
            expect(content).toBe(existingContent);
        });
    });

    describe("when copilot-agent option is not provided", () => {
        it("should throw an error indicating the option is required", async () => {
            // Arrange - no copilot-agent option

            // Act & Assert
            await expect(
                newCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: newCommand,
                    data: { targetDir: testDir },
                }),
            ).rejects.toThrow();
        });
    });

    describe("when creating multiple agents", () => {
        it("should create separate files for each agent", async () => {
            // Arrange
            const agent1 = "test-specialist";
            const agent2 = "code-reviewer";
            const agent3 = "docs-writer";

            // Act
            await newCommand.run({
                rawArgs: ["--copilot-agent", agent1],
                args: { _: [], "copilot-agent": agent1 },
                cmd: newCommand,
                data: { targetDir: testDir },
            });
            await newCommand.run({
                rawArgs: ["--copilot-agent", agent2],
                args: { _: [], "copilot-agent": agent2 },
                cmd: newCommand,
                data: { targetDir: testDir },
            });
            await newCommand.run({
                rawArgs: ["--copilot-agent", agent3],
                args: { _: [], "copilot-agent": agent3 },
                cmd: newCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const agentsDir = join(testDir, ".github", "agents");
            const files = await import("node:fs/promises").then((fs) =>
                fs.readdir(agentsDir),
            );
            expect(files).toContain("test-specialist.md");
            expect(files).toContain("code-reviewer.md");
            expect(files).toContain("docs-writer.md");
        });
    });
});
