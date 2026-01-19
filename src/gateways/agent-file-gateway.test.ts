import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemAgentFileGateway } from "./agent-file-gateway.js";

const chance = new Chance();

describe("AgentFileGateway", () => {
    let testDir: string;
    let gateway: FileSystemAgentFileGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-agent-gateway-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemAgentFileGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("agentFileExists", () => {
        describe("given an agent file that exists", () => {
            it("should return true", async () => {
                // Arrange
                const agentName = chance.word();
                const agentsDir = join(testDir, ".github", "agents");
                await mkdir(agentsDir, { recursive: true });
                await writeFile(join(agentsDir, `${agentName}.md`), "content");

                // Act
                const result = await gateway.agentFileExists(
                    testDir,
                    agentName,
                );

                // Assert
                expect(result).toBe(true);
            });
        });

        describe("given an agent file that does not exist", () => {
            it("should return false", async () => {
                // Arrange
                const agentName = chance.word();

                // Act
                const result = await gateway.agentFileExists(
                    testDir,
                    agentName,
                );

                // Assert
                expect(result).toBe(false);
            });
        });

        describe("given the agents directory does not exist", () => {
            it("should return false", async () => {
                // Arrange
                const agentName = chance.word();
                const emptyDir = join(testDir, "empty");
                await mkdir(emptyDir, { recursive: true });

                // Act
                const result = await gateway.agentFileExists(
                    emptyDir,
                    agentName,
                );

                // Assert
                expect(result).toBe(false);
            });
        });
    });

    describe("ensureAgentsDirectory", () => {
        describe("given the agents directory does not exist", () => {
            it("should create the .github/agents directory", async () => {
                // Arrange
                const agentsDir = join(testDir, ".github", "agents");

                // Act
                await gateway.ensureAgentsDirectory(testDir);

                // Assert
                const stat = await import("node:fs/promises").then((fs) =>
                    fs.stat(agentsDir),
                );
                expect(stat.isDirectory()).toBe(true);
            });
        });

        describe("given the .github directory exists but agents does not", () => {
            it("should create the agents directory", async () => {
                // Arrange
                const githubDir = join(testDir, ".github");
                await mkdir(githubDir, { recursive: true });

                // Act
                await gateway.ensureAgentsDirectory(testDir);

                // Assert
                const agentsDir = join(testDir, ".github", "agents");
                const stat = await import("node:fs/promises").then((fs) =>
                    fs.stat(agentsDir),
                );
                expect(stat.isDirectory()).toBe(true);
            });
        });

        describe("given the agents directory already exists", () => {
            it("should not throw an error", async () => {
                // Arrange
                const agentsDir = join(testDir, ".github", "agents");
                await mkdir(agentsDir, { recursive: true });

                // Act & Assert
                await expect(
                    gateway.ensureAgentsDirectory(testDir),
                ).resolves.not.toThrow();
            });
        });
    });

    describe("writeAgentFile", () => {
        describe("given valid content and path", () => {
            it("should write the content to the agent file", async () => {
                // Arrange
                const agentName = chance.word();
                const content = chance.paragraph();
                const agentsDir = join(testDir, ".github", "agents");
                await mkdir(agentsDir, { recursive: true });

                // Act
                await gateway.writeAgentFile(testDir, agentName, content);

                // Assert
                const filePath = join(agentsDir, `${agentName}.md`);
                const fileContent = await readFile(filePath, "utf-8");
                expect(fileContent).toBe(content);
            });
        });
    });

    describe("getAgentFilePath", () => {
        it("should return the correct path for an agent file", () => {
            // Arrange
            const agentName = "security";

            // Act
            const result = gateway.getAgentFilePath(testDir, agentName);

            // Assert
            expect(result).toBe(
                join(testDir, ".github", "agents", "security.md"),
            );
        });
    });
});
