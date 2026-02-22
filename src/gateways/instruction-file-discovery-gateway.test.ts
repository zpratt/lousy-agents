import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemInstructionFileDiscoveryGateway } from "./instruction-file-discovery-gateway.js";

const chance = new Chance();

describe("FileSystemInstructionFileDiscoveryGateway", () => {
    let testDir: string;
    let gateway: FileSystemInstructionFileDiscoveryGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-instruction-discovery-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemInstructionFileDiscoveryGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when no instruction files exist", () => {
        it("should return an empty array", async () => {
            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toEqual([]);
        });
    });

    describe("when .github/copilot-instructions.md exists", () => {
        it("should discover it with copilot-instructions format", async () => {
            // Arrange
            const githubDir = join(testDir, ".github");
            await mkdir(githubDir, { recursive: true });
            await writeFile(
                join(githubDir, "copilot-instructions.md"),
                "# Instructions\n",
            );

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toHaveLength(1);
            expect(files[0].format).toBe("copilot-instructions");
        });
    });

    describe("when .github/instructions/ has markdown files", () => {
        it("should discover them with copilot-scoped format", async () => {
            // Arrange
            const instructionsDir = join(testDir, ".github", "instructions");
            await mkdir(instructionsDir, { recursive: true });
            await writeFile(
                join(instructionsDir, "test.instructions.md"),
                "# Test\n",
            );

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toHaveLength(1);
            expect(files[0].format).toBe("copilot-scoped");
        });
    });

    describe("when .github/agents/ has markdown files", () => {
        it("should discover them with copilot-agent format", async () => {
            // Arrange
            const agentsDir = join(testDir, ".github", "agents");
            await mkdir(agentsDir, { recursive: true });
            await writeFile(
                join(agentsDir, "reviewer.md"),
                "---\nname: reviewer\n---\n",
            );

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toHaveLength(1);
            expect(files[0].format).toBe("copilot-agent");
        });
    });

    describe("when AGENTS.md exists at repo root", () => {
        it("should discover it with agents-md format", async () => {
            // Arrange
            await writeFile(join(testDir, "AGENTS.md"), "# Agents\n");

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toHaveLength(1);
            expect(files[0].format).toBe("agents-md");
        });
    });

    describe("when CLAUDE.md exists at repo root", () => {
        it("should discover it with claude-md format", async () => {
            // Arrange
            await writeFile(join(testDir, "CLAUDE.md"), "# Claude\n");

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toHaveLength(1);
            expect(files[0].format).toBe("claude-md");
        });
    });

    describe("when multiple instruction files exist across formats", () => {
        it("should discover all of them", async () => {
            // Arrange
            const githubDir = join(testDir, ".github");
            const agentsDir = join(testDir, ".github", "agents");
            await mkdir(agentsDir, { recursive: true });
            await writeFile(
                join(githubDir, "copilot-instructions.md"),
                "# Instructions\n",
            );
            await writeFile(
                join(agentsDir, "reviewer.md"),
                "---\nname: reviewer\n---\n",
            );
            await writeFile(join(testDir, "CLAUDE.md"), "# Claude\n");

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toHaveLength(3);
            const formats = files.map((f) => f.format).sort();
            expect(formats).toEqual([
                "claude-md",
                "copilot-agent",
                "copilot-instructions",
            ]);
        });
    });
});
