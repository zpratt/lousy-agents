import {
    link,
    mkdir,
    mkdtemp,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MAX_FILE_BYTES } from "@lousy-agents/core/lib/instruction-import-expand.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanRepositoryWithReport } from "./scanner.js";

const IMPORT_OF_MISSING_FILE = "@./nothing-here.md\n";

describe("scanning a repository that holds an instruction file the scan cannot read", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await realpath(
            await mkdtemp(join(tmpdir(), "doctor-unread-files-")),
        );
        await mkdir(join(repoRoot, "docs"));
        await writeFile(join(repoRoot, "AGENTS.md"), "# Agents\n");
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    it.skipIf(process.platform === "win32")(
        "should name a CLAUDE.md with more than one hard link",
        async () => {
            await writeFile(
                join(repoRoot, "docs", "alias.txt"),
                IMPORT_OF_MISSING_FILE,
            );
            await link(
                join(repoRoot, "docs", "alias.txt"),
                join(repoRoot, "CLAUDE.md"),
            );

            const scan = await scanRepositoryWithReport(repoRoot);

            expect(scan.unreadFiles).toEqual(["CLAUDE.md"]);
        },
    );

    it.skipIf(process.platform === "win32")(
        "should name a skill with more than one hard link, which lint reads without refusing",
        async () => {
            await mkdir(join(repoRoot, ".claude", "skills", "s"), {
                recursive: true,
            });
            await writeFile(
                join(repoRoot, "docs", "alias.txt"),
                "---\nname: s\ndescription: a skill\n---\n# S\n",
            );
            await link(
                join(repoRoot, "docs", "alias.txt"),
                join(repoRoot, ".claude", "skills", "s", "SKILL.md"),
            );

            const scan = await scanRepositoryWithReport(repoRoot);

            expect(scan.unreadFiles).toEqual([".claude/skills/s/SKILL.md"]);
        },
    );

    it.skipIf(process.platform === "win32")(
        "should name an agent with more than one hard link",
        async () => {
            await mkdir(join(repoRoot, ".claude", "agents"), {
                recursive: true,
            });
            await writeFile(
                join(repoRoot, "docs", "agent-alias.txt"),
                "---\nname: reviewer\ndescription: a reviewer\n---\n# Reviewer\n",
            );
            await link(
                join(repoRoot, "docs", "agent-alias.txt"),
                join(repoRoot, ".claude", "agents", "reviewer.md"),
            );

            const scan = await scanRepositoryWithReport(repoRoot);

            expect(scan.unreadFiles).toEqual([".claude/agents/reviewer.md"]);
        },
    );

    it("should name a CLAUDE.md over the size the scan reads", async () => {
        await writeFile(
            join(repoRoot, "CLAUDE.md"),
            `${IMPORT_OF_MISSING_FILE}${"x".repeat(DEFAULT_MAX_FILE_BYTES)}`,
        );

        const scan = await scanRepositoryWithReport(repoRoot);

        expect(scan.unreadFiles).toEqual(["CLAUDE.md"]);
    });

    it("should name a file the reader refuses to open, whatever the reason", async () => {
        await writeFile(join(repoRoot, "CLAUDE.md"), "# Project\n");

        const scan = await scanRepositoryWithReport(repoRoot, {
            readContent: async (file) => {
                if (file.relPath === "CLAUDE.md") {
                    throw new Error("EMFILE");
                }
                return null;
            },
        });

        expect(scan.unreadFiles).toEqual(["CLAUDE.md"]);
    });

    it.skipIf(process.platform === "win32")(
        "should name a file under each path it is reached by, not the one real path behind them",
        async () => {
            await mkdir(join(repoRoot, ".agents", "skills", "demo"), {
                recursive: true,
            });
            await mkdir(join(repoRoot, ".claude"));
            await symlink(
                "../.agents/skills",
                join(repoRoot, ".claude", "skills"),
            );
            await writeFile(
                join(repoRoot, ".agents", "skills", "demo", "SKILL.md"),
                "x".repeat(DEFAULT_MAX_FILE_BYTES + 1),
            );

            const scan = await scanRepositoryWithReport(repoRoot);

            expect([...(scan.unreadFiles ?? [])].sort()).toEqual([
                ".agents/skills/demo/SKILL.md",
                ".claude/skills/demo/SKILL.md",
            ]);
        },
    );

    it("should leave the field out when every file was read", async () => {
        await writeFile(join(repoRoot, "CLAUDE.md"), "# Project\n");

        const scan = await scanRepositoryWithReport(repoRoot);

        expect(scan).not.toHaveProperty("unreadFiles");
    });

    it("should not name a file that has no content to read", async () => {
        await mkdir(join(repoRoot, ".claude"));
        await writeFile(join(repoRoot, ".claude", "settings.json"), "{}");

        const scan = await scanRepositoryWithReport(repoRoot, {
            readContent: async () => null,
        });

        expect(scan).not.toHaveProperty("unreadFiles");
    });
});
