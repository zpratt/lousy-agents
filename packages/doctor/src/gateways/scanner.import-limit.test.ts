import {
    mkdir,
    mkdtemp,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MAX_EDGES } from "@lousy-agents/core/lib/instruction-import-expand.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Edge } from "../entities/edge-types.js";
import { scanRepositoryWithReport } from "./scanner.js";

const CLAUDE_MD = "CLAUDE.md";
const ONE_MIB = 1_048_576;
const FILLER_LINE = "@./a.md\n";

describe("scanning a file with more @ imports than the limit", () => {
    let workDir: string;
    let repoRoot: string;
    let outsideRoot: string;

    beforeEach(async () => {
        workDir = await realpath(
            await mkdtemp(join(tmpdir(), "doctor-import-limit-")),
        );
        repoRoot = join(workDir, "repo");
        outsideRoot = join(workDir, "outside");
        await mkdir(repoRoot);
        await mkdir(outsideRoot);
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    async function writeImporterOfDistinctFiles(count: number): Promise<void> {
        const names = Array.from({ length: count }, (_, i) => `f${i}.md`);
        await Promise.all(
            names.map((name) => writeFile(join(repoRoot, name), `${name}\n`)),
        );
        await writeFile(
            join(repoRoot, CLAUDE_MD),
            names.map((name) => `@./${name}\n`).join(""),
        );
    }

    async function hardImportsOfClaudeMd(): Promise<{
        edges: Edge[];
        importLimit: Awaited<
            ReturnType<typeof scanRepositoryWithReport>
        >["importLimit"];
    }> {
        const scan = await scanRepositoryWithReport(repoRoot);
        const record = scan.records.find((r) => r.path === CLAUDE_MD);
        return {
            edges: (record?.edges ?? []).filter(
                (e) => e.type === "hard-import",
            ),
            importLimit: scan.importLimit,
        };
    }

    it("should check only as many imports as lint does, and name the file", async () => {
        await writeImporterOfDistinctFiles(DEFAULT_MAX_EDGES + 44);

        const { edges, importLimit } = await hardImportsOfClaudeMd();

        expect(edges).toHaveLength(DEFAULT_MAX_EDGES);
        expect(importLimit).toEqual({
            maxImports: DEFAULT_MAX_EDGES,
            files: [CLAUDE_MD],
        });
    });

    it("should check the first imports, in the order written", async () => {
        await writeImporterOfDistinctFiles(DEFAULT_MAX_EDGES + 1);

        const { edges } = await hardImportsOfClaudeMd();

        expect(edges[0]?.target).toBe("f0.md");
        expect(edges[DEFAULT_MAX_EDGES - 1]?.target).toBe(
            `f${DEFAULT_MAX_EDGES - 1}.md`,
        );
    });

    it("should report no limit for a file with exactly as many imports as the limit", async () => {
        await writeImporterOfDistinctFiles(DEFAULT_MAX_EDGES);

        const { edges, importLimit } = await hardImportsOfClaudeMd();

        expect(edges).toHaveLength(DEFAULT_MAX_EDGES);
        expect(importLimit).toBeUndefined();
    });

    describe("when a 1 MiB file is nothing but the same import", () => {
        it("should end with at most the limit's edges, and still see an outside symlink named first", async () => {
            await writeFile(join(repoRoot, "a.md"), "a\n");
            await writeFile(join(outsideRoot, "secret.md"), "secret\n");
            await symlink(
                join(outsideRoot, "secret.md"),
                join(repoRoot, "link.md"),
            );
            const header = "@./link.md\n";
            const filler = FILLER_LINE.repeat(
                Math.floor((ONE_MIB - header.length) / FILLER_LINE.length),
            );
            await writeFile(join(repoRoot, CLAUDE_MD), header + filler);

            const { edges, importLimit } = await hardImportsOfClaudeMd();

            expect(edges.length).toBeLessThanOrEqual(DEFAULT_MAX_EDGES);
            expect(edges[0]).toMatchObject({
                malformed: true,
                reason: "symlink-outside",
                target: "link.md",
            });
            expect(importLimit?.files).toEqual([CLAUDE_MD]);
        });
    });
});

describe("scanning a repository that holds symbolic links out of the repository", () => {
    let workDir: string;
    let repoRoot: string;
    let outsideRoot: string;

    beforeEach(async () => {
        workDir = await realpath(
            await mkdtemp(join(tmpdir(), "doctor-skipped-links-")),
        );
        repoRoot = join(workDir, "repo");
        outsideRoot = join(workDir, "outside");
        await mkdir(join(repoRoot, "docs"), { recursive: true });
        await mkdir(outsideRoot);
        await writeFile(join(repoRoot, CLAUDE_MD), "# Project\n");
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it("should name the links the walk skipped", async () => {
        await writeFile(join(outsideRoot, "secret.md"), "secret\n");
        await symlink(
            join(outsideRoot, "secret.md"),
            join(repoRoot, "docs", "leak.md"),
        );

        const scan = await scanRepositoryWithReport(repoRoot);

        expect(scan.skippedOutsideRoot).toEqual(["docs/leak.md"]);
    });

    it("should leave the field out when no link was skipped", async () => {
        const scan = await scanRepositoryWithReport(repoRoot);

        expect(scan).not.toHaveProperty("skippedOutsideRoot");
    });
});
