/**
 * Doctor ↔ MCP parity tests.
 *
 * The doctor scanner and the MCP server tools (analyze_instruction_quality,
 * validate_instruction_coverage) inspect the same instruction constructs. The
 * MCP tools are thin wrappers over the core gateways used below, so these
 * tests compare doctor directly with the code paths the MCP tools run.
 *
 * Each test proves one inconsistency and fails until the two sides agree.
 */

import { mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import type { DiscoveredScript } from "@lousy-agents/core/entities/feedback-loop.js";
import { createClaudeInstructionImportExpander } from "@lousy-agents/core/gateways/claude-instruction-import-expander.js";
import { createInstructionAnalysisGateway } from "@lousy-agents/core/gateways/instruction-analysis-gateway.js";
import { createInstructionFileDiscoveryGateway } from "@lousy-agents/core/gateways/instruction-file-discovery-gateway.js";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanRepository } from "./scanner.js";

const chance = new Chance();

async function writeRepoFile(
    repoRoot: string,
    relPath: string,
    content: string,
): Promise<void> {
    const absPath = join(repoRoot, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content);
}

async function doctorInstructionPaths(repoRoot: string): Promise<string[]> {
    const records = await scanRepository(repoRoot);
    return records
        .filter((record) => record.constructType === "instruction")
        .map((record) => record.path);
}

async function mcpInstructionPaths(repoRoot: string): Promise<string[]> {
    const files =
        await createInstructionFileDiscoveryGateway().discoverInstructionFiles(
            repoRoot,
        );
    return files.map((file) =>
        relative(repoRoot, file.filePath).replaceAll("\\", "/"),
    );
}

async function doctorEdgesFrom(repoRoot: string, path: string) {
    const records = await scanRepository(repoRoot);
    return records.find((record) => record.path === path)?.edges ?? [];
}

async function mcpResolvedImports(
    repoRoot: string,
    path: string,
): Promise<string[]> {
    const document =
        await createClaudeInstructionImportExpander().expandClaudeEntrypoint({
            repoRoot,
            absoluteFilePath: join(repoRoot, path),
        });
    return document.resolvedImports.map((p) =>
        relative(repoRoot, p).replaceAll("\\", "/"),
    );
}

describe("doctor and MCP parity", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = join(
            await realpath(tmpdir()),
            `doctor-mcp-parity-${chance.guid()}`,
        );
        await mkdir(repoRoot, { recursive: true });
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    describe("instruction file discovery", () => {
        describe("when a scoped Copilot instruction file is in a subdirectory of .github/instructions", () => {
            it("should be discovered by MCP as doctor inventories it", async () => {
                // Arrange
                const scopedPath = `.github/instructions/${chance.word()}/${chance.word()}.instructions.md`;
                await writeRepoFile(
                    repoRoot,
                    scopedPath,
                    "---\napplyTo: 'src/**'\n---\n# Scoped\n",
                );

                // Act
                const doctorPaths = await doctorInstructionPaths(repoRoot);
                const mcpPaths = await mcpInstructionPaths(repoRoot);

                // Assert
                expect(doctorPaths).toContain(scopedPath);
                expect(mcpPaths).toContain(scopedPath);
            });
        });

        describe("when AGENTS.md is a symlink to a file inside the repository", () => {
            it("should be discovered by MCP as doctor inventories it", async () => {
                // Arrange
                const canonicalPath = `docs/${chance.word()}.md`;
                await writeRepoFile(repoRoot, canonicalPath, "# Agents\n");
                await symlink(canonicalPath, join(repoRoot, "AGENTS.md"));

                // Act
                const doctorPaths = await doctorInstructionPaths(repoRoot);
                const mcpPaths = await mcpInstructionPaths(repoRoot);

                // Assert
                expect(doctorPaths).toContain("AGENTS.md");
                expect(mcpPaths).toContain("AGENTS.md");
            });
        });

        describe.each([[".claude/CLAUDE.md"], ["AGENTS.override.md"]])(
            "when the repository has %s",
            (instructionPath) => {
                it("should be discovered by MCP as doctor inventories it", async () => {
                    // Arrange
                    await writeRepoFile(
                        repoRoot,
                        instructionPath,
                        `# ${chance.word()}\n`,
                    );

                    // Act
                    const doctorPaths = await doctorInstructionPaths(repoRoot);
                    const mcpPaths = await mcpInstructionPaths(repoRoot);

                    // Assert
                    expect(doctorPaths).toContain(instructionPath);
                    expect(mcpPaths).toContain(instructionPath);
                });
            },
        );
    });

    describe("instruction coverage", () => {
        describe("when a mandatory script is documented only in CLAUDE.md", () => {
            it("should count the script as documented, as instruction quality discovery does", async () => {
                // Arrange
                const scriptName = `${chance.word({ length: 8 })}-check`;
                const script: DiscoveredScript = {
                    name: scriptName,
                    command: chance.word(),
                    phase: "test",
                    isMandatory: true,
                };
                await writeRepoFile(
                    repoRoot,
                    "CLAUDE.md",
                    `# Commands\n\nRun \`npm run ${scriptName}\` before each commit.\n`,
                );

                // Act
                const qualityPaths = await mcpInstructionPaths(repoRoot);
                const doctorPaths = await doctorInstructionPaths(repoRoot);
                const coverage =
                    await createInstructionAnalysisGateway().analyzeCoverage(
                        repoRoot,
                        [script],
                        [],
                    );

                // Assert
                expect(qualityPaths).toContain("CLAUDE.md");
                expect(doctorPaths).toContain("CLAUDE.md");
                expect(
                    coverage.documentedInInstructions.map((item) => item.name),
                ).toContain(scriptName);
            });
        });
    });

    describe("Claude @import edges", () => {
        describe("when an @path line is inside a fenced code block", () => {
            it("should not create a doctor edge, as MCP import expansion ignores it", async () => {
                // Arrange
                const codeTarget = `${chance.word()}/${chance.word()}`;
                await writeRepoFile(
                    repoRoot,
                    "CLAUDE.md",
                    `# Claude\n\n\`\`\`bash\n@${codeTarget}\n\`\`\`\n`,
                );

                // Act
                const mcpImports = await mcpResolvedImports(
                    repoRoot,
                    "CLAUDE.md",
                );
                const doctorEdges = await doctorEdgesFrom(
                    repoRoot,
                    "CLAUDE.md",
                );

                // Assert
                expect(mcpImports).toEqual([]);
                expect(doctorEdges).toEqual([]);
            });
        });

        describe("when an @path import targets an existing non-markdown file", () => {
            it("should be a valid doctor edge, as MCP import expansion resolves it", async () => {
                // Arrange
                const importTarget = `docs/${chance.word()}.txt`;
                await writeRepoFile(repoRoot, importTarget, chance.sentence());
                await writeRepoFile(
                    repoRoot,
                    "CLAUDE.md",
                    `# Claude\n\n@${importTarget}\n`,
                );

                // Act
                const mcpImports = await mcpResolvedImports(
                    repoRoot,
                    "CLAUDE.md",
                );
                const doctorEdges = await doctorEdgesFrom(
                    repoRoot,
                    "CLAUDE.md",
                );

                // Assert
                expect(mcpImports).toContain(importTarget);
                expect(doctorEdges).toEqual([
                    expect.objectContaining({
                        target: importTarget,
                        malformed: false,
                    }),
                ]);
            });
        });

        describe("when an @path import targets the home directory", () => {
            it("should be reported by doctor as an escape, as MCP import expansion reports it", async () => {
                // Arrange
                const homeTarget = `~/.claude/${chance.word()}.md`;
                await writeRepoFile(
                    repoRoot,
                    "CLAUDE.md",
                    `# Claude\n\n@${homeTarget}\n`,
                );

                // Act
                const document =
                    await createClaudeInstructionImportExpander().expandClaudeEntrypoint(
                        {
                            repoRoot,
                            absoluteFilePath: join(repoRoot, "CLAUDE.md"),
                        },
                    );
                const doctorEdges = await doctorEdgesFrom(
                    repoRoot,
                    "CLAUDE.md",
                );

                // Assert
                expect(
                    document.expansionDiagnostics.map((d) => d.ruleId),
                ).toContain("instruction/import-escape");
                expect(doctorEdges).toEqual([
                    expect.objectContaining({
                        malformed: true,
                        reason: "path-traversal",
                    }),
                ]);
            });
        });
    });
});
