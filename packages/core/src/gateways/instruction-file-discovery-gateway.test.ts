import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InstructionDiscoveryDiagnostic } from "../entities/instruction-quality.js";
import { instructionDiscoveryEntries } from "../lib/agentic-location-matchers.js";
import { createClaudeInstructionImportExpander } from "./claude-instruction-import-expander.js";
import { FileSystemInstructionFileDiscoveryGateway } from "./instruction-file-discovery-gateway.js";
import { DEFAULT_MAX_WALK_DEPTH } from "./repository-walk.js";

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

    describe("when .github/instructions contains symbolic links back to itself", () => {
        it("should discover each instruction file once", async () => {
            // Arrange
            const fileName = `${chance.word()}.instructions.md`;
            const instructionsDir = join(testDir, ".github", "instructions");
            await mkdir(instructionsDir, { recursive: true });
            await writeFile(join(instructionsDir, fileName), "# Scoped\n");
            await symlink(instructionsDir, join(instructionsDir, "loop-a"));
            await symlink(instructionsDir, join(instructionsDir, "loop-b"));

            const files = await gateway.discoverInstructionFiles(testDir);

            expect(files).toEqual([
                {
                    filePath: join(instructionsDir, fileName),
                    format: "copilot-scoped",
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
            const outsideFile = join(outsideDir, "external.md");
            await writeFile(outsideFile, "# External\n");
            const linkPath = join(testDir, ...instructionPath.split("/"));
            await mkdir(dirname(linkPath), { recursive: true });
            await symlink(outsideFile, linkPath);

            const files = await gateway.discoverInstructionFiles(testDir);

            expect(files).toEqual([]);
        });

        it("should not discover files in a symlinked .github/instructions directory", async () => {
            await writeFile(join(outsideDir, "test.md"), "# Test\n");
            await mkdir(join(testDir, ".github"), { recursive: true });
            await symlink(outsideDir, join(testDir, ".github", "instructions"));

            // Act
            const files = await gateway.discoverInstructionFiles(testDir);

            // Assert
            expect(files).toEqual([]);
        });
    });

    describe("when an instruction file path is a directory inside the repository", () => {
        it("should discover nothing and report nothing", async () => {
            await mkdir(join(testDir, "CLAUDE.md"), { recursive: true });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            const files = await gateway.discoverInstructionFiles(
                testDir,
                (diagnostic) => diagnostics.push(diagnostic),
            );

            expect(files).toEqual([]);
            expect(diagnostics).toEqual([]);
        });
    });

    describe("when instruction symlinks lead outside the repository", () => {
        const SymlinkSkippedRuleId = "instruction/discovery-symlink-skipped";
        let outsideDir: string;

        beforeEach(async () => {
            outsideDir = join(tmpdir(), `outside-${chance.guid()}`);
            await mkdir(outsideDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(outsideDir, { recursive: true, force: true });
        });

        async function linkOutside(
            relativePath: string,
            kind: "file" | "directory" = "file",
        ): Promise<void> {
            const target = join(outsideDir, chance.guid());
            if (kind === "file") {
                await writeFile(target, "# External\n");
            } else {
                await mkdir(target, { recursive: true });
            }
            const linkPath = join(testDir, ...relativePath.split("/"));
            await mkdir(dirname(linkPath), { recursive: true });
            await symlink(target, linkPath);
        }

        async function discoveryDiagnostics(
            discoveryGateway = gateway,
        ): Promise<InstructionDiscoveryDiagnostic[]> {
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];
            await discoveryGateway.discoverInstructionFiles(
                testDir,
                (diagnostic) => diagnostics.push(diagnostic),
            );
            return diagnostics;
        }

        it("should report one diagnostic that names the instruction file link and how to have it analyzed", async () => {
            await linkOutside("CLAUDE.md");

            const diagnostics = await discoveryDiagnostics();

            expect(diagnostics).toEqual([
                {
                    ruleId: SymlinkSkippedRuleId,
                    message:
                        "Instruction file discovery skipped 1 symbolic link(s) that point outside the repository, so their targets were not analyzed: CLAUDE.md. Replace a link with a file inside the repository to have it analyzed.",
                },
            ]);
        });

        it("should report a symlinked instruction directory by its path", async () => {
            await linkOutside(".github/instructions", "directory");

            const diagnostics = await discoveryDiagnostics();

            expect(diagnostics).toEqual([
                expect.objectContaining({
                    ruleId: SymlinkSkippedRuleId,
                    message: expect.stringContaining(
                        "outside the repository, so their targets were not analyzed: .github/instructions.",
                    ),
                }),
            ]);
        });

        it("should report a symlinked instruction file below an instruction directory", async () => {
            await linkOutside(
                ".github/instructions/team/shared.instructions.md",
            );

            const diagnostics = await discoveryDiagnostics();

            expect(diagnostics).toEqual([
                expect.objectContaining({
                    message: expect.stringContaining(
                        ".github/instructions/team/shared.instructions.md.",
                    ),
                }),
            ]);
        });

        it("should report every skipped link in one diagnostic, in the order discovery met them", async () => {
            await linkOutside("CLAUDE.md");
            await linkOutside("AGENTS.md");
            await linkOutside(".github/instructions/b.instructions.md");
            await linkOutside(".github/instructions/a.instructions.md");

            const diagnostics = await discoveryDiagnostics();

            expect(diagnostics).toEqual([
                expect.objectContaining({
                    message: expect.stringContaining(
                        "skipped 4 symbolic link(s) that point outside the repository, so their targets were not analyzed: .github/instructions/a.instructions.md, .github/instructions/b.instructions.md, AGENTS.md, CLAUDE.md.",
                    ),
                }),
            ]);
        });

        it("should report a directory named AGENTS.md that links outside the repository, because the nested walk would have entered it", async () => {
            await linkOutside("AGENTS.md", "directory");

            const diagnostics = await discoveryDiagnostics();

            expect(diagnostics).toEqual([
                expect.objectContaining({
                    ruleId: SymlinkSkippedRuleId,
                    message: expect.stringContaining("AGENTS.md"),
                }),
            ]);
        });

        it("should report nothing for a vendor directory symlink that points outside the repository", async () => {
            await linkOutside("vendor/docs", "directory");

            const diagnostics = await discoveryDiagnostics();

            expect(diagnostics).toEqual([]);
        });

        it("should report nothing for a link to a file the walk would not have discovered anyway", async () => {
            await linkOutside(".github/instructions/notes.txt");

            const diagnostics = await discoveryDiagnostics();

            expect(diagnostics).toEqual([]);
        });

        it("should report nothing when no link leads outside the repository", async () => {
            const target = join(testDir, "real.md");
            await writeFile(target, "# Real\n");
            await symlink(target, join(testDir, "CLAUDE.md"));

            const diagnostics = await discoveryDiagnostics();

            expect(diagnostics).toEqual([]);
        });

        it("should report it after the discovery limit when both apply", async () => {
            await linkOutside("CLAUDE.md");
            const agents = join(testDir, ".github", "agents");
            await mkdir(agents, { recursive: true });
            await writeFile(join(agents, "a.md"), chance.sentence());
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxDirectories: 0,
            });

            const diagnostics = await discoveryDiagnostics(capped);

            expect(diagnostics.map((d) => d.ruleId)).toEqual([
                "instruction/discovery-limit-reached",
                SymlinkSkippedRuleId,
            ]);
        });

        it("should not require a diagnostics callback", async () => {
            await linkOutside("CLAUDE.md");

            const files = await gateway.discoverInstructionFiles(testDir);

            expect(files).toEqual([]);
        });
    });

    describe("when a scoped instruction file is in a subdirectory of .github/instructions", () => {
        it("should discover it with copilot-scoped format", async () => {
            const subdir = chance.word();
            const fileName = `${chance.word()}.instructions.md`;
            const scopedDir = join(testDir, ".github", "instructions", subdir);
            await mkdir(scopedDir, { recursive: true });
            await writeFile(join(scopedDir, fileName), "# Scoped\n");

            const files = await gateway.discoverInstructionFiles(testDir);

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
            const filePath = join(testDir, ...instructionPath.split("/"));
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, `# ${chance.word()}\n`);

            const files = await gateway.discoverInstructionFiles(testDir);

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
                        join(
                            dirPath,
                            `entry-${index}${entry.fileSuffix ?? ".md"}`,
                        ),
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

    describe("when .github/instructions has more directories than the directory cap", () => {
        const EntryDirectoryAndFirstSubdirectory = 2;

        beforeEach(async () => {
            for (const name of ["s1", "s2", "s3"]) {
                const directory = join(
                    testDir,
                    ".github",
                    "instructions",
                    name,
                );
                await mkdir(directory, { recursive: true });
                await writeFile(
                    join(directory, "a.instructions.md"),
                    chance.sentence(),
                );
            }
        });

        it("should keep the files found before the cap and report the limit exactly once", async () => {
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxDirectories: EntryDirectoryAndFirstSubdirectory,
            });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            const files = await capped.discoverInstructionFiles(
                testDir,
                (diagnostic) => diagnostics.push(diagnostic),
            );

            expect(files.map((f) => relative(testDir, f.filePath))).toEqual([
                join(".github", "instructions", "s1", "a.instructions.md"),
            ]);
            expect(diagnostics).toEqual([
                {
                    ruleId: "instruction/discovery-limit-reached",
                    message: expect.stringContaining("2"),
                },
            ]);
        });

        it("should report nothing when every walk stays within the directory cap", async () => {
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxDirectories: 6,
            });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            const files = await capped.discoverInstructionFiles(
                testDir,
                (diagnostic) => diagnostics.push(diagnostic),
            );

            expect(files).toHaveLength(3);
            expect(diagnostics).toEqual([]);
        });

        it("should not require a diagnostics callback", async () => {
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxDirectories: 2,
            });

            const files = await capped.discoverInstructionFiles(testDir);

            expect(files).toHaveLength(1);
        });
    });

    describe("when two instruction subdirectories are aliases of one directory", () => {
        it("should discover the shared files once, under the first path in name order", async () => {
            const shared = join(testDir, ".github", "shared");
            await mkdir(shared, { recursive: true });
            await writeFile(
                join(shared, "x.instructions.md"),
                chance.sentence(),
            );
            const instructions = join(testDir, ".github", "instructions");
            await mkdir(instructions, { recursive: true });
            await symlink(shared, join(instructions, "b-alias"));
            await symlink(shared, join(instructions, "a-alias"));

            const files = await gateway.discoverInstructionFiles(testDir);

            expect(files.map((f) => relative(testDir, f.filePath))).toEqual([
                join(".github", "instructions", "a-alias", "x.instructions.md"),
            ]);
        });
    });

    describe("when .github/instructions has a dist subdirectory", () => {
        it("should leave the instruction files in it undiscovered, the same as doctor", async () => {
            const directory = join(testDir, ".github", "instructions", "dist");
            await mkdir(directory, { recursive: true });
            await writeFile(
                join(directory, "built.instructions.md"),
                chance.sentence(),
            );

            const files = await gateway.discoverInstructionFiles(testDir);

            expect(files.map((f) => relative(testDir, f.filePath))).toEqual([]);
        });
    });

    describe("when .github/instructions has markdown files that are not *.instructions.md", () => {
        it("should discover only the files named *.instructions.md, as Copilot loads them", async () => {
            const dir = join(testDir, ".github", "instructions");
            await mkdir(join(dir, "sub"), { recursive: true });
            const scoped = join(dir, "sub", `${chance.word()}.instructions.md`);
            await writeFile(scoped, "# Scoped\n");
            await writeFile(join(dir, "README.md"), "# Not an instruction\n");
            await writeFile(
                join(dir, "sub", "notes.md"),
                "# Not an instruction\n",
            );

            const files = await gateway.discoverInstructionFiles(testDir);

            expect(files).toEqual([
                { filePath: scoped, format: "copilot-scoped" },
            ]);
        });

        it("should still discover any .md file in a directory entry with no suffix requirement", async () => {
            const dir = join(testDir, ".github", "agents");
            await mkdir(dir, { recursive: true });
            const agent = join(dir, `${chance.word()}.md`);
            await writeFile(agent, "# Agent\n");

            const files = await gateway.discoverInstructionFiles(testDir);

            expect(files).toEqual([
                { filePath: agent, format: "copilot-agent" },
            ]);
        });
    });

    describe("when .github/instructions is nested deeper than the depth limit", () => {
        const DiscoveryLimitRuleId = "instruction/discovery-limit-reached";
        const instructionsPath = join(".github", "instructions");

        async function writeNested(levels: number, name: string) {
            const directory = join(
                testDir,
                instructionsPath,
                ...Array.from({ length: levels }, (_, level) => `l${level}`),
            );
            await mkdir(directory, { recursive: true });
            await writeFile(
                join(directory, `${name}.instructions.md`),
                chance.sentence(),
            );
        }

        async function discover(discoveryGateway = gateway): Promise<{
            files: string[];
            diagnostics: InstructionDiscoveryDiagnostic[];
        }> {
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];
            const files = await discoveryGateway.discoverInstructionFiles(
                testDir,
                (diagnostic) => diagnostics.push(diagnostic),
            );
            return {
                files: files.map((f) => relative(testDir, f.filePath)),
                diagnostics,
            };
        }

        it("should keep the files it reached and report the depth limit exactly once", async () => {
            await writeNested(0, "shallow");
            await writeNested(DEFAULT_MAX_WALK_DEPTH + 1, "too-deep");

            const { files, diagnostics } = await discover();

            expect(files).toEqual([
                join(instructionsPath, "shallow.instructions.md"),
            ]);
            expect(diagnostics).toEqual([
                {
                    ruleId: DiscoveryLimitRuleId,
                    message: expect.stringContaining(
                        `${DEFAULT_MAX_WALK_DEPTH} directories deep`,
                    ),
                },
            ]);
        });

        it("should report nothing for a tree whose deepest directory is exactly at the limit", async () => {
            await writeNested(DEFAULT_MAX_WALK_DEPTH, "edge");

            const { files, diagnostics } = await discover();

            expect(files).toHaveLength(1);
            expect(diagnostics).toEqual([]);
        });

        it("should report the directory limit and the depth limit together in one diagnostic", async () => {
            await writeNested(DEFAULT_MAX_WALK_DEPTH + 1, "chain");
            for (const name of ["z1", "z2"]) {
                const directory = join(testDir, instructionsPath, name);
                await mkdir(directory, { recursive: true });
                await writeFile(
                    join(directory, "x.instructions.md"),
                    chance.sentence(),
                );
            }
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxDirectories: DEFAULT_MAX_WALK_DEPTH + 2,
            });

            const { diagnostics } = await discover(capped);

            expect(diagnostics).toEqual([
                {
                    ruleId: DiscoveryLimitRuleId,
                    message: `Instruction file discovery stopped after listing ${DEFAULT_MAX_WALK_DEPTH + 2} directories, so instruction files in the remaining directories were not analyzed. Instruction file discovery did not go more than ${DEFAULT_MAX_WALK_DEPTH} directories deep, so instruction files in deeper directories were not analyzed.`,
                },
            ]);
        });
    });

    describe("when .github/instructions holds more entries than the entry budget", () => {
        const EntryBudget = 2;

        beforeEach(async () => {
            const directory = join(testDir, ".github", "instructions");
            await mkdir(directory, { recursive: true });
            for (const name of ["a", "b", "c", "d", "e"]) {
                await writeFile(
                    join(directory, `${name}.instructions.md`),
                    chance.sentence(),
                );
            }
        });

        it("should keep the files it reached and report the entry limit exactly once", async () => {
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxEntries: EntryBudget,
            });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            const files = await capped.discoverInstructionFiles(
                testDir,
                (diagnostic) => diagnostics.push(diagnostic),
            );

            expect(files).toHaveLength(EntryBudget);
            expect(diagnostics).toEqual([
                {
                    ruleId: "instruction/discovery-limit-reached",
                    message: `Instruction file discovery stopped after examining ${EntryBudget} directory entries, so instruction files in the remaining entries were not analyzed.`,
                },
            ]);
        });

        it("should report nothing when the budget covers every entry", async () => {
            const roomy = new FileSystemInstructionFileDiscoveryGateway({
                maxEntries: 7,
            });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            await roomy.discoverInstructionFiles(testDir, (diagnostic) =>
                diagnostics.push(diagnostic),
            );

            expect(diagnostics).toEqual([]);
        });
    });

    describe("when the entry budget is reached in one location and not in a later one", () => {
        it("should still report the limit, since the flag is kept across locations", async () => {
            const agents = join(testDir, ".github", "agents");
            const instructions = join(testDir, ".github", "instructions");
            await mkdir(agents, { recursive: true });
            await mkdir(instructions, { recursive: true });
            for (const name of ["a", "b", "c"]) {
                await writeFile(join(agents, `${name}.md`), chance.sentence());
            }
            await writeFile(
                join(instructions, "only.instructions.md"),
                chance.sentence(),
            );
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxEntries: 2,
            });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            await capped.discoverInstructionFiles(testDir, (diagnostic) =>
                diagnostics.push(diagnostic),
            );

            expect(diagnostics).toEqual([
                expect.objectContaining({
                    ruleId: "instruction/discovery-limit-reached",
                    message: expect.stringContaining("2 directory entries"),
                }),
            ]);
        });
    });

    describe("when the nested filename walk meets a directory cap", () => {
        it("should apply the directory cap and report the limit", async () => {
            for (const name of ["a", "b", "c"]) {
                const directory = join(testDir, name);
                await mkdir(directory);
                await writeFile(join(directory, "CLAUDE.md"), "# Nested\n");
            }
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxDirectories: 1,
            });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            const files = await capped.discoverInstructionFiles(
                testDir,
                (diagnostic) => diagnostics.push(diagnostic),
            );

            expect(files).toEqual([]);
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    ruleId: "instruction/discovery-limit-reached",
                    message: expect.stringContaining("listing 1 directories"),
                }),
            ]);
        });

        it("should apply the entry budget and report the limit", async () => {
            for (const name of ["a", "b", "c"]) {
                const directory = join(testDir, name);
                await mkdir(directory);
                await writeFile(join(directory, "CLAUDE.md"), "# Nested\n");
            }
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxEntries: 1,
            });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            const files = await capped.discoverInstructionFiles(
                testDir,
                (diagnostic) => diagnostics.push(diagnostic),
            );

            expect(files).toEqual([]);
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    ruleId: "instruction/discovery-limit-reached",
                    message: expect.stringContaining("1 directory entries"),
                }),
            ]);
        });
    });

    describe("when a directory outside an instruction root is past the nested filename depth", () => {
        it("should report a possible miss of CLAUDE.md and AGENTS.md and not of instruction files", async () => {
            const directory = join(
                testDir,
                ...Array.from(
                    { length: DEFAULT_MAX_WALK_DEPTH + 1 },
                    (_, level) => `n${level}`,
                ),
            );
            await mkdir(directory, { recursive: true });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            await gateway.discoverInstructionFiles(testDir, (diagnostic) =>
                diagnostics.push(diagnostic),
            );

            expect(diagnostics).toEqual([
                {
                    ruleId: "instruction/discovery-limit-reached",
                    message: `Instruction file discovery did not go more than ${DEFAULT_MAX_WALK_DEPTH} directories deep, so CLAUDE.md, AGENTS.md, AGENTS.MD, and agents.md files in deeper directories may not have been analyzed.`,
                },
            ]);
        });
    });

    describe("when the directory cap is reached in one location and a later location is absent", () => {
        it("should still report the limit, since the flag is kept across locations", async () => {
            const agents = join(testDir, ".github", "agents");
            await mkdir(agents, { recursive: true });
            await writeFile(join(agents, "a.md"), chance.sentence());
            const capped = new FileSystemInstructionFileDiscoveryGateway({
                maxDirectories: 0,
            });
            const diagnostics: InstructionDiscoveryDiagnostic[] = [];

            await capped.discoverInstructionFiles(testDir, (diagnostic) =>
                diagnostics.push(diagnostic),
            );

            expect(diagnostics).toEqual([
                expect.objectContaining({
                    ruleId: "instruction/discovery-limit-reached",
                    message: expect.stringContaining("0 directories"),
                }),
            ]);
        });
    });

    describe("when pkg/CLAUDE.md is a symlink to .github/agents/CLAUDE.md", () => {
        it("should keep the Claude path and expand its @ import", async () => {
            const agents = join(testDir, ".github", "agents");
            await mkdir(agents, { recursive: true });
            await writeFile(join(agents, "CLAUDE.md"), "@./missing-guide.md\n");
            const pkg = join(testDir, "pkg");
            await mkdir(pkg);
            await symlink(join(agents, "CLAUDE.md"), join(pkg, "CLAUDE.md"));

            const files = await gateway.discoverInstructionFiles(testDir);
            const claude = files.find((file) =>
                file.filePath.endsWith(`${join("pkg", "CLAUDE.md")}`),
            );

            expect(claude).toMatchObject({ format: "claude-md" });
            const expanded =
                await createClaudeInstructionImportExpander().expandClaudeEntrypoint(
                    {
                        repoRoot: testDir,
                        absoluteFilePath:
                            claude?.contentPath ?? claude?.filePath ?? "",
                    },
                );
            expect(
                expanded.expansionDiagnostics.some(
                    (diagnostic) =>
                        diagnostic.ruleId === "instruction/import-unresolved",
                ),
            ).toBe(true);
        });
    });
});
