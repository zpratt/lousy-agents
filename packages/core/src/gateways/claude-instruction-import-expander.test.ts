import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClaudeInstructionImportExpander } from "./claude-instruction-import-expander.js";

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
});
