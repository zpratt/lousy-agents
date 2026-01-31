import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newCommand, skillCommand } from "./new.js";

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

describe("new skill command", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-skill-cmd-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when creating a skill", () => {
        it("should create a SKILL.md file at .github/skills/<name>/SKILL.md", async () => {
            // Arrange
            const skillName = "github-actions-debug";

            // Act
            await skillCommand.run({
                rawArgs: [skillName],
                args: { _: [], name: skillName },
                cmd: skillCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const skillFile = join(
                testDir,
                ".github",
                "skills",
                skillName,
                "SKILL.md",
            );
            const content = await readFile(skillFile, "utf-8");
            expect(content).toContain("name: github-actions-debug");
        });

        it("should normalize skill names with spaces to kebab-case", async () => {
            // Arrange
            const skillName = "GitHub Actions Debug";

            // Act
            await skillCommand.run({
                rawArgs: [skillName],
                args: { _: [], name: skillName },
                cmd: skillCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const skillFile = join(
                testDir,
                ".github",
                "skills",
                "github-actions-debug",
                "SKILL.md",
            );
            const content = await readFile(skillFile, "utf-8");
            expect(content).toContain("name: github-actions-debug");
        });

        it("should create the .github/skills directory if it does not exist", async () => {
            // Arrange
            const skillName = chance.word();
            const skillsDir = join(testDir, ".github", "skills");

            // Act
            await skillCommand.run({
                rawArgs: [skillName],
                args: { _: [], name: skillName },
                cmd: skillCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const stat = await import("node:fs/promises").then((fs) =>
                fs.stat(skillsDir),
            );
            expect(stat.isDirectory()).toBe(true);
        });

        it("should include YAML frontmatter with name and description", async () => {
            // Arrange
            const skillName = chance.word();

            // Act
            await skillCommand.run({
                rawArgs: [skillName],
                args: { _: [], name: skillName },
                cmd: skillCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const skillFile = join(
                testDir,
                ".github",
                "skills",
                skillName,
                "SKILL.md",
            );
            const content = await readFile(skillFile, "utf-8");
            expect(content).toContain("---");
            expect(content).toContain("name:");
            expect(content).toContain("description:");
        });

        it("should include a documentation link comment", async () => {
            // Arrange
            const skillName = chance.word();

            // Act
            await skillCommand.run({
                rawArgs: [skillName],
                args: { _: [], name: skillName },
                cmd: skillCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const skillFile = join(
                testDir,
                ".github",
                "skills",
                skillName,
                "SKILL.md",
            );
            const content = await readFile(skillFile, "utf-8");
            expect(content).toContain(
                "https://docs.github.com/en/copilot/concepts/agents/about-agent-skills",
            );
        });

        it("should include skill instruction structure", async () => {
            // Arrange
            const skillName = chance.word();

            // Act
            await skillCommand.run({
                rawArgs: [skillName],
                args: { _: [], name: skillName },
                cmd: skillCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const skillFile = join(
                testDir,
                ".github",
                "skills",
                skillName,
                "SKILL.md",
            );
            const content = await readFile(skillFile, "utf-8");
            expect(content).toContain("## When to Use This Skill");
            expect(content).toContain("## Instructions");
            expect(content).toContain("## Guidelines");
            expect(content).toContain("## Examples");
        });
    });

    describe("when the skill directory already exists", () => {
        it("should throw an error", async () => {
            // Arrange
            const skillName = "github-actions-debug";
            const skillDir = join(testDir, ".github", "skills", skillName);
            await mkdir(skillDir, { recursive: true });

            // Act & Assert
            await expect(
                skillCommand.run({
                    rawArgs: [skillName],
                    args: { _: [], name: skillName },
                    cmd: skillCommand,
                    data: { targetDir: testDir },
                }),
            ).rejects.toThrow("already exists");
        });

        it("should not create a SKILL.md file in existing directory", async () => {
            // Arrange
            const skillName = "github-actions-debug";
            const skillDir = join(testDir, ".github", "skills", skillName);
            await mkdir(skillDir, { recursive: true });

            // Act
            try {
                await skillCommand.run({
                    rawArgs: [skillName],
                    args: { _: [], name: skillName },
                    cmd: skillCommand,
                    data: { targetDir: testDir },
                });
            } catch {
                // Expected to throw
            }

            // Assert - no SKILL.md file should be created
            const skillFile = join(skillDir, "SKILL.md");
            const exists = await import("node:fs/promises")
                .then((fs) => fs.access(skillFile))
                .then(() => true)
                .catch(() => false);
            expect(exists).toBe(false);
        });
    });

    describe("when skill name is not provided", () => {
        it("should throw an error indicating the name is required", async () => {
            // Arrange - no skill name

            // Act & Assert
            await expect(
                skillCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: skillCommand,
                    data: { targetDir: testDir },
                }),
            ).rejects.toThrow();
        });
    });

    describe("when creating multiple skills", () => {
        it("should create separate directories for each skill", async () => {
            // Arrange
            const skill1 = "github-actions-debug";
            const skill2 = "code-review";
            const skill3 = "testing";

            // Act
            await skillCommand.run({
                rawArgs: [skill1],
                args: { _: [], name: skill1 },
                cmd: skillCommand,
                data: { targetDir: testDir },
            });
            await skillCommand.run({
                rawArgs: [skill2],
                args: { _: [], name: skill2 },
                cmd: skillCommand,
                data: { targetDir: testDir },
            });
            await skillCommand.run({
                rawArgs: [skill3],
                args: { _: [], name: skill3 },
                cmd: skillCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const skillsDir = join(testDir, ".github", "skills");
            const dirs = await import("node:fs/promises").then((fs) =>
                fs.readdir(skillsDir),
            );
            expect(dirs).toContain("github-actions-debug");
            expect(dirs).toContain("code-review");
            expect(dirs).toContain("testing");
        });
    });
});
