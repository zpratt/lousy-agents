import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_FILE_BYTES } from "../lib/instruction-import-expand.js";
import { createClaudeInstructionImportExpander } from "./claude-instruction-import-expander.js";
import type { BoundedReadOutcome } from "./read-regular-file-no-follow.js";

const chance = new Chance();

describe("createClaudeInstructionImportExpander", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = join(
            tmpdir(),
            `claude-import-expander-${chance.hash({ length: 8 })}`,
        );
        await mkdir(repoRoot, { recursive: true });
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    it("should return spliced effective content for a Coach-style wrapper", async () => {
        const claudePath = join(repoRoot, "CLAUDE.md");
        await writeFile(claudePath, "intro\n@./AGENTS.md\n");
        await writeFile(join(repoRoot, "AGENTS.md"), "## Commands\n");

        const expander = createClaudeInstructionImportExpander();
        const result = await expander.expandClaudeEntrypoint({
            repoRoot,
            absoluteFilePath: claudePath,
        });

        expect(result.content).toBe("intro\n## Commands\n\n");
        expect(result.effectiveRoot).toBe(claudePath);
        expect(result.resolvedImports).toEqual([join(repoRoot, "AGENTS.md")]);
        expect(result.expansionDiagnostics).toEqual([]);
    });

    it("should return expansion diagnostics with absolute importer path and line/column", async () => {
        const claudePath = join(repoRoot, "CLAUDE.md");
        await writeFile(claudePath, "intro\n@./missing.md\n");

        const expander = createClaudeInstructionImportExpander();
        const result = await expander.expandClaudeEntrypoint({
            repoRoot,
            absoluteFilePath: claudePath,
        });

        expect(result.expansionDiagnostics).toHaveLength(1);
        expect(result.expansionDiagnostics[0]).toMatchObject({
            ruleId: "instruction/import-unresolved",
            filePath: claudePath,
            line: 2,
            column: 1,
            endLine: 2,
            endColumn: 14,
        });
        expect(result.resolvedImports).toEqual([]);
    });

    it("should reject an absolute path outside the repository root", async () => {
        const expander = createClaudeInstructionImportExpander();

        await expect(
            expander.expandClaudeEntrypoint({
                repoRoot,
                absoluteFilePath: "/tmp/outside.md",
            }),
        ).rejects.toThrow("outside repository root");
    });

    describe("when mapping diagnostics to line and column", () => {
        it("should read the importer through the bounded no-follow reader with the import size cap", async () => {
            const claudePath = join(repoRoot, "CLAUDE.md");
            const content = "intro\n@./missing.md\n";
            await writeFile(claudePath, content);
            const readSource = vi.fn(
                async (): Promise<BoundedReadOutcome> => ({
                    ok: true,
                    content,
                }),
            );
            const expander = createClaudeInstructionImportExpander({
                readSource,
            });

            const result = await expander.expandClaudeEntrypoint({
                repoRoot,
                absoluteFilePath: claudePath,
            });

            expect(readSource).toHaveBeenCalledWith(
                claudePath,
                DEFAULT_MAX_FILE_BYTES,
            );
            expect(result.expansionDiagnostics[0]).toMatchObject({
                ruleId: "instruction/import-unresolved",
                line: 2,
                column: 1,
            });
        });

        it("should fall back to line 1 column 1 instead of throwing when the importer can no longer be read safely", async () => {
            const claudePath = join(repoRoot, "CLAUDE.md");
            await writeFile(claudePath, "intro\n@./missing.md\n");
            const expander = createClaudeInstructionImportExpander({
                readSource: async () => ({ ok: false, reason: "symlink" }),
            });

            const result = await expander.expandClaudeEntrypoint({
                repoRoot,
                absoluteFilePath: claudePath,
            });

            expect(result.expansionDiagnostics).toEqual([
                expect.objectContaining({
                    ruleId: "instruction/import-unresolved",
                    filePath: claudePath,
                    line: 1,
                    column: 1,
                }),
            ]);
        });

        it("should read each importer once however many diagnostics it has", async () => {
            const claudePath = join(repoRoot, "CLAUDE.md");
            const content = "@./a.md\n@./b.md\n";
            await writeFile(claudePath, content);
            const readSource = vi.fn(
                async (): Promise<BoundedReadOutcome> => ({
                    ok: true,
                    content,
                }),
            );
            const expander = createClaudeInstructionImportExpander({
                readSource,
            });

            const result = await expander.expandClaudeEntrypoint({
                repoRoot,
                absoluteFilePath: claudePath,
            });

            expect(result.expansionDiagnostics).toHaveLength(2);
            expect(readSource).toHaveBeenCalledTimes(1);
        });
    });
});
