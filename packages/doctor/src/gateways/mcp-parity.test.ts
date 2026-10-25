/**
 * Doctor ↔ MCP parity tests.
 *
 * The doctor scanner and the MCP server tools (analyze_instruction_quality,
 * validate_instruction_coverage) inspect the same instruction constructs. The
 * MCP tools are thin wrappers over the core gateways used below, so these
 * tests compare doctor directly with the core code paths the MCP tools run.
 * A fix for an MCP-side inconsistency must therefore land in those core
 * gateways (or the MCP tool must switch to a core gateway that these tests
 * exercise).
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

const CLAUDE_MD = "CLAUDE.md";
const AGENTS_MD = "AGENTS.md";

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

async function coreInstructionPaths(repoRoot: string): Promise<string[]> {
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

async function expandClaudeEntrypoint(repoRoot: string, path: string) {
    return createClaudeInstructionImportExpander().expandClaudeEntrypoint({
        repoRoot,
        absoluteFilePath: join(repoRoot, path),
    });
}

async function coreResolvedImports(
    repoRoot: string,
    path: string,
): Promise<string[]> {
    const document = await expandClaudeEntrypoint(repoRoot, path);
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
            it("should be discovered by the core discovery that MCP uses, as doctor inventories it", async () => {
                // Arrange
                const scopedPath = `.github/instructions/${chance.word()}/${chance.word()}.instructions.md`;
                await writeRepoFile(
                    repoRoot,
                    scopedPath,
                    "---\napplyTo: 'src/**'\n---\n# Scoped\n",
                );

                // Act
                const doctorPaths = await doctorInstructionPaths(repoRoot);
                const corePaths = await coreInstructionPaths(repoRoot);

                // Assert
                expect(doctorPaths).toContain(scopedPath);
                expect(corePaths).toContain(scopedPath);
            });
        });

        describe("when AGENTS.md is a symlink to a file inside the repository", () => {
            it("should get the same answer from doctor and from the core discovery that MCP uses", async () => {
                // Arrange
                const canonicalPath = `docs/${chance.word()}.md`;
                await writeRepoFile(repoRoot, canonicalPath, "# Agents\n");
                await symlink(canonicalPath, join(repoRoot, AGENTS_MD));

                // Act
                const doctorPaths = await doctorInstructionPaths(repoRoot);
                const corePaths = await coreInstructionPaths(repoRoot);

                // Assert
                expect({
                    coreDiscoversSymlink: corePaths.includes(AGENTS_MD),
                }).toEqual({
                    coreDiscoversSymlink: doctorPaths.includes(AGENTS_MD),
                });
            });
        });

        describe.each([[".claude/CLAUDE.md"], ["AGENTS.override.md"]])(
            "when the repository has %s",
            (instructionPath) => {
                it("should be discovered by the core discovery that MCP uses, as doctor inventories it", async () => {
                    // Arrange
                    await writeRepoFile(
                        repoRoot,
                        instructionPath,
                        `# ${chance.word()}\n`,
                    );

                    // Act
                    const doctorPaths = await doctorInstructionPaths(repoRoot);
                    const corePaths = await coreInstructionPaths(repoRoot);

                    // Assert
                    expect(doctorPaths).toContain(instructionPath);
                    expect(corePaths).toContain(instructionPath);
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
                    CLAUDE_MD,
                    `# Commands\n\nRun \`npm run ${scriptName}\` before each commit.\n`,
                );

                // Act
                const qualityPaths = await coreInstructionPaths(repoRoot);
                const doctorPaths = await doctorInstructionPaths(repoRoot);
                const coverage =
                    await createInstructionAnalysisGateway().analyzeCoverage(
                        repoRoot,
                        [script],
                        [],
                    );

                // Assert
                expect(qualityPaths).toContain(CLAUDE_MD);
                expect(doctorPaths).toContain(CLAUDE_MD);
                expect(
                    coverage.documentedInInstructions.map((item) => item.name),
                ).toContain(scriptName);
            });
        });
    });

    describe("Claude @import edges", () => {
        describe("when an @path line is inside a fenced code block", () => {
            it("should not create a doctor edge, as core import expansion ignores it", async () => {
                // Arrange
                const codeTarget = `${chance.word()}/${chance.word()}`;
                await writeRepoFile(
                    repoRoot,
                    CLAUDE_MD,
                    `# Claude\n\n\`\`\`bash\n@${codeTarget}\n\`\`\`\n`,
                );

                // Act
                const coreImports = await coreResolvedImports(
                    repoRoot,
                    CLAUDE_MD,
                );
                const doctorEdges = await doctorEdgesFrom(repoRoot, CLAUDE_MD);

                // Assert
                expect(coreImports).toEqual([]);
                expect(doctorEdges).toEqual([]);
            });
        });

        describe("when an @path import targets an existing non-markdown file", () => {
            it("should be a valid doctor edge, as core import expansion resolves it", async () => {
                // Arrange
                const importTarget = `docs/${chance.word()}.txt`;
                await writeRepoFile(repoRoot, importTarget, chance.sentence());
                await writeRepoFile(
                    repoRoot,
                    CLAUDE_MD,
                    `# Claude\n\n@${importTarget}\n`,
                );

                // Act
                const coreImports = await coreResolvedImports(
                    repoRoot,
                    CLAUDE_MD,
                );
                const doctorEdges = await doctorEdgesFrom(repoRoot, CLAUDE_MD);

                // Assert
                expect(coreImports).toContain(importTarget);
                expect(doctorEdges).toEqual([
                    expect.objectContaining({
                        target: importTarget,
                        malformed: false,
                    }),
                ]);
            });
        });

        describe("when an @path import targets the home directory", () => {
            it("should not be reported by doctor as a missing file in the repository, as core reports it as an escape", async () => {
                // Arrange
                const homeTarget = `~/.claude/${chance.word()}.md`;
                await writeRepoFile(
                    repoRoot,
                    CLAUDE_MD,
                    `# Claude\n\n@${homeTarget}\n`,
                );

                // Act
                const document = await expandClaudeEntrypoint(
                    repoRoot,
                    CLAUDE_MD,
                );
                const doctorEdges = await doctorEdgesFrom(repoRoot, CLAUDE_MD);

                // Assert
                expect(
                    document.expansionDiagnostics.map((d) => d.ruleId),
                ).toContain("instruction/import-escape");
                expect(doctorEdges).toHaveLength(1);
                expect(doctorEdges[0]).toMatchObject({ malformed: true });
                expect(doctorEdges[0]?.reason).not.toBe("missing-target");
            });
        });
    });
});
