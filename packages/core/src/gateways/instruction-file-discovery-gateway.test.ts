import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { instructionDiscoveryEntries } from "../lib/agentic-location-matchers.js";
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

    describe("when AGENTS.md is a symbolic link to a file inside the repository", () => {
        it("should discover it at its harness path and read content from the target", async () => {
            // Arrange
            const canonicalRelPath = join("docs", `${chance.word()}.md`);
            await mkdir(join(testDir, "docs"), { recursive: true });
            await writeFile(join(testDir, canonicalRelPath), "# Agents\n");
            await symlink(
                join(testDir, canonicalRelPath),
                join(testDir, "AGENTS.md"),
            );

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toEqual([
                {
                    filePath: join(testDir, "AGENTS.md"),
                    format: "agents-md",
                    contentPath: join(testDir, canonicalRelPath),
                },
            ]);
        });
    });

    describe("when .github/instructions/ is a symbolic link to a directory inside the repository", () => {
        it("should discover the files in the target directory at their harness paths", async () => {
            // Arrange
            const fileName = `${chance.word()}.instructions.md`;
            const realDir = join(testDir, "real-instructions");
            await mkdir(realDir, { recursive: true });
            await mkdir(join(testDir, ".github"), { recursive: true });
            await writeFile(join(realDir, fileName), "# Scoped\n");
            await symlink(realDir, join(testDir, ".github", "instructions"));

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toEqual([
                {
                    filePath: join(
                        testDir,
                        ".github",
                        "instructions",
                        fileName,
                    ),
                    format: "copilot-scoped",
                    contentPath: join(realDir, fileName),
                },
            ]);
        });
    });

    describe("when an instruction file is a symbolic link to a file outside the repository", () => {
        let outsideDir: string;

        beforeEach(async () => {
            outsideDir = join(tmpdir(), `outside-${chance.guid()}`);
            await mkdir(outsideDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(outsideDir, { recursive: true, force: true });
        });

        it.each([
            [".github/copilot-instructions.md"],
            ["AGENTS.md"],
            ["CLAUDE.md"],
        ])("should not discover %s", async (instructionPath) => {
            // Arrange
            const outsideFile = join(outsideDir, "external.md");
            await writeFile(outsideFile, "# External\n");
            const linkPath = join(testDir, ...instructionPath.split("/"));
            await mkdir(dirname(linkPath), { recursive: true });
            await symlink(outsideFile, linkPath);

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toEqual([]);
        });

        it("should not discover files in a symlinked .github/instructions directory", async () => {
            // Arrange
            await writeFile(join(outsideDir, "test.md"), "# Test\n");
            await mkdir(join(testDir, ".github"), { recursive: true });
            await symlink(outsideDir, join(testDir, ".github", "instructions"));

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toEqual([]);
        });
    });

    describe("when a scoped instruction file is in a subdirectory of .github/instructions", () => {
        it("should discover it with copilot-scoped format", async () => {
            // Arrange
            const subdir = chance.word();
            const fileName = `${chance.word()}.instructions.md`;
            const scopedDir = join(testDir, ".github", "instructions", subdir);
            await mkdir(scopedDir, { recursive: true });
            await writeFile(join(scopedDir, fileName), "# Scoped\n");

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toEqual([
                {
                    filePath: join(scopedDir, fileName),
                    format: "copilot-scoped",
                },
            ]);
        });
    });

    describe.each([
        [".claude/CLAUDE.md", "claude-md"],
        ["AGENTS.override.md", "agents-md"],
    ])("when %s exists", (instructionPath, expectedFormat) => {
        it(`should discover it with ${expectedFormat} format`, async () => {
            // Arrange
            const filePath = join(testDir, ...instructionPath.split("/"));
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, `# ${chance.word()}\n`);

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toEqual([{ filePath, format: expectedFormat }]);
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

    describe("when files exist for every instructionDiscoveryEntries() location", () => {
        it("should discover each catalog entry with its instructionFormat", async () => {
            // Arrange
            const entries = instructionDiscoveryEntries();
            const expectedFormats: string[] = [];
            for (const [index, entry] of entries.entries()) {
                const format = entry.instructionFormat;
                if (format == null) {
                    continue;
                }
                expectedFormats.push(format);
                const relativePath = join(...entry.path.split("/"));
                if (entry.matchKind === "exact") {
                    const absolutePath = join(testDir, relativePath);
                    await mkdir(dirname(absolutePath), { recursive: true });
                    await writeFile(absolutePath, `# ${format}\n`);
                } else {
                    const dirPath = join(testDir, relativePath);
                    await mkdir(dirPath, { recursive: true });
                    await writeFile(
                        join(dirPath, `entry-${index}.md`),
                        `# ${format}\n`,
                    );
                }
            }

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toHaveLength(expectedFormats.length);
            const formats = files.map((f) => f.format).sort();
            expect(formats).toEqual([...expectedFormats].sort());
        });
    });
});
