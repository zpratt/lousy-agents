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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    AGENT_CATALOG_DEPTH,
    collapseToFirstRealFile,
    discoverAgentFiles,
    discoverInstructionLocations,
    discoverSkillFiles,
    discoverSubagentFiles,
} from "./agentic-artifact-discovery.js";
import type { DirectoryLister, WalkedFile } from "./repository-walk.js";

describe("discoverInstructionLocations", () => {
    let testDir = "";

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    async function makeRepo(): Promise<string> {
        testDir = join(
            tmpdir(),
            `instruction-locations-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        );
        await mkdir(testDir, { recursive: true });
        return testDir;
    }

    it("should return the instruction file ten directories below .github/instructions and not the one eleven below", async () => {
        const root = await makeRepo();
        const atLimit = [
            ".github",
            "instructions",
            ...Array.from({ length: 10 }, (_, index) => String(index + 1)),
            "at-limit.instructions.md",
        ];
        const pastLimit = [
            ".github",
            "instructions",
            ...Array.from({ length: 11 }, (_, index) => String(index + 1)),
            "past-limit.instructions.md",
        ];
        await mkdir(join(root, ...atLimit.slice(0, -1)), { recursive: true });
        await mkdir(join(root, ...pastLimit.slice(0, -1)), {
            recursive: true,
        });
        await writeFile(join(root, ...atLimit), "# at limit\n");
        await writeFile(join(root, ...pastLimit), "# past limit\n");

        const walks = await discoverInstructionLocations(root, {
            rootDirectoryName: "repo",
        });
        const paths = walks.flatMap((walk) =>
            walk.walked.files.map((file) => file.relativePath),
        );

        expect(paths).toContain(atLimit.join("/"));
        expect(paths).not.toContain(pastLimit.join("/"));
    });

    it("should return both logical paths when two instruction directories alias one real directory", async () => {
        const root = await makeRepo();
        const shared = join(root, ".github", "shared");
        await mkdir(shared, { recursive: true });
        await writeFile(join(shared, "x.instructions.md"), "# shared\n");
        const instructions = join(root, ".github", "instructions");
        await mkdir(instructions, { recursive: true });
        await symlink(shared, join(instructions, "b-alias"));
        await symlink(shared, join(instructions, "a-alias"));

        const walks = await discoverInstructionLocations(root, {
            rootDirectoryName: "repo",
        });
        const paths = walks
            .filter((walk) => walk.role === "catalog")
            .flatMap((walk) =>
                walk.walked.files.map((file) => file.relativePath),
            )
            .sort();

        expect(paths).toEqual([
            ".github/instructions/a-alias/x.instructions.md",
            ".github/instructions/b-alias/x.instructions.md",
        ]);
    });

    it("should keep b-extra rather than b when those aliases name one instruction file", async () => {
        const root = await makeRepo();
        const shared = join(root, ".github", "shared");
        await mkdir(shared, { recursive: true });
        await writeFile(join(shared, "x.instructions.md"), "# shared\n");
        const instructions = join(root, ".github", "instructions");
        await mkdir(instructions, { recursive: true });
        await symlink(shared, join(instructions, "b"));
        await symlink(shared, join(instructions, "b-extra"));

        const walks = await discoverInstructionLocations(root, {
            rootDirectoryName: "repo",
        });
        const files =
            walks.find((walk) => walk.format === "copilot-scoped")?.walked
                .files ?? [];

        expect(
            collapseToFirstRealFile(files).map((file) => file.relativePath),
        ).toEqual([".github/instructions/b-extra/x.instructions.md"]);
    });

    it("should skip the nested root walk when the caller asks for catalog walks only", async () => {
        const root = await makeRepo();

        const walks = await discoverInstructionLocations(root, {
            rootDirectoryName: "repo",
            includeNestedWalk: false,
        });

        expect(walks.every((walk) => walk.role === "catalog")).toBe(true);
    });
});

describe("discoverAgentFiles", () => {
    let testDir = "";

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("should return an agent 32 directories below .github/agents and not one 33 below", async () => {
        testDir = join(
            tmpdir(),
            `agent-depth-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        );
        const atLimit = [
            ".github",
            "agents",
            ...Array.from({ length: AGENT_CATALOG_DEPTH }, (_, index) =>
                String(index + 1),
            ),
            "reviewer.md",
        ];
        const pastLimit = [
            ".github",
            "agents",
            ...Array.from({ length: AGENT_CATALOG_DEPTH + 1 }, (_, index) =>
                String(index + 1),
            ),
            "reviewer.md",
        ];
        await mkdir(join(testDir, ...atLimit.slice(0, -1)), {
            recursive: true,
        });
        await mkdir(join(testDir, ...pastLimit.slice(0, -1)), {
            recursive: true,
        });
        await writeFile(join(testDir, ...atLimit), "# agent\n");
        await writeFile(join(testDir, ...pastLimit), "# agent\n");

        const files = await discoverAgentFiles(testDir, {
            rootDirectoryName: "repo",
        });
        const paths = files.files.map((file) => file.relativePath);

        expect(paths).toContain(atLimit.join("/"));
        expect(paths).not.toContain(pastLimit.join("/"));
    });
});

describe.each([
    ["agent", ".github/agents", discoverAgentFiles],
    ["subagent", ".claude/agents", discoverSubagentFiles],
])("lint discovery of a %s catalog", (_construct, root, discover) => {
    let workDir = "";
    let repoRoot = "";
    let outsideRoot = "";

    beforeEach(async () => {
        workDir = await realpath(
            await mkdtemp(join(tmpdir(), "construct-discovery-")),
        );
        repoRoot = join(workDir, "repo");
        outsideRoot = join(workDir, "outside");
        await mkdir(join(repoRoot, ...root.split("/")), { recursive: true });
        await mkdir(outsideRoot);
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    async function writeAgent(
        relativePath: string,
        base = repoRoot,
    ): Promise<void> {
        const absolute = join(base, ...relativePath.split("/"));
        await mkdir(join(absolute, ".."), { recursive: true });
        await writeFile(absolute, "# agent\n");
    }

    async function lintPaths(
        limits: { maxDirectories?: number; maxEntries?: number } = {},
    ): Promise<string[]> {
        const walk = await discover(repoRoot, {
            rootDirectoryName: "repo",
            purpose: "lint",
            ...limits,
        });
        return walk.files.map((file) => file.relativePath);
    }

    describe("when an entry is a symbolic link", () => {
        it("should not list a symbolic link to a file", async () => {
            await writeAgent("real/target.md");
            await symlink(
                join(repoRoot, "real", "target.md"),
                join(repoRoot, ...root.split("/"), "linked.md"),
            );

            const paths = await lintPaths();

            expect(paths).toEqual([]);
        });

        it("should not enter a symbolic link to a directory inside the repository", async () => {
            await writeAgent("real/hidden.md");
            await symlink(
                join(repoRoot, "real"),
                join(repoRoot, ...root.split("/"), "linked"),
            );

            const paths = await lintPaths();

            expect(paths).toEqual([]);
        });

        it("should list nothing when the catalog root itself is a symbolic link", async () => {
            await writeAgent("elsewhere/reviewer.md");
            await rm(join(repoRoot, ...root.split("/")), { recursive: true });
            await symlink(
                join(repoRoot, "elsewhere"),
                join(repoRoot, ...root.split("/")),
            );

            const paths = await lintPaths();

            expect(paths).toEqual([]);
        });

        it("should not spend the directory budget on a linked tree, so a later directory is still reached", async () => {
            for (const name of ["1", "2", "3", "4"]) {
                await mkdir(join(repoRoot, "vendor", name), {
                    recursive: true,
                });
            }
            await symlink(
                join(repoRoot, "vendor"),
                join(repoRoot, ...root.split("/"), "a-vendor"),
            );
            await writeAgent(`${root}/z-team/reviewer.md`);

            const walk = await discover(repoRoot, {
                rootDirectoryName: "repo",
                purpose: "lint",
                maxDirectories: 3,
            });

            expect(walk.files.map((file) => file.relativePath)).toEqual([
                `${root}/z-team/reviewer.md`,
            ]);
            expect(walk.directoryLimitReached).toBe(false);
        });

        it("should list nothing for a link that leaves the repository", async () => {
            await writeAgent("secret.md", outsideRoot);
            await symlink(
                join(outsideRoot, "secret.md"),
                join(repoRoot, ...root.split("/"), "leak.md"),
            );

            const walk = await discover(repoRoot, {
                rootDirectoryName: "repo",
                purpose: "lint",
            });

            expect(walk.files).toEqual([]);
        });
    });

    describe("when an entry name contains two dots", () => {
        it("should leave out a file whose name contains two dots", async () => {
            await writeAgent(`${root}/review..strict.md`);
            await writeAgent(`${root}/plain.md`);

            const paths = await lintPaths();

            expect(paths).toEqual([`${root}/plain.md`]);
        });

        it("should leave out everything below a directory whose name contains two dots", async () => {
            await writeAgent(`${root}/team..x/reviewer.md`);

            const paths = await lintPaths();

            expect(paths).toEqual([]);
        });
    });

    describe("when an entry is not an agent file", () => {
        it("should leave out non-markdown files, build output, and fixtures", async () => {
            await writeAgent(`${root}/notes.txt`);
            await writeAgent(`${root}/dist/built.md`);
            await writeAgent(`${root}/tests/fixtures/sample.md`);
            await writeAgent(`${root}/keep.md`);

            const paths = await lintPaths();

            expect(paths).toEqual([`${root}/keep.md`]);
        });
    });

    describe("when a directory cannot be listed", () => {
        const refuseToList: DirectoryLister = async () => {
            throw Object.assign(new Error("permission denied"), {
                code: "EACCES",
            });
        };

        it("should surface the permission error for a lint walk", async () => {
            await expect(
                discover(repoRoot, {
                    rootDirectoryName: "repo",
                    purpose: "lint",
                    listDirectory: refuseToList,
                }),
            ).rejects.toMatchObject({ code: "EACCES" });
        });

        it("should treat a directory that vanished as empty for a lint walk", async () => {
            const vanished: DirectoryLister = async () => {
                throw Object.assign(new Error("gone"), { code: "ENOENT" });
            };

            const walk = await discover(repoRoot, {
                rootDirectoryName: "repo",
                purpose: "lint",
                listDirectory: vanished,
            });

            expect(walk.files).toEqual([]);
        });
    });

    describe("when the walk is an inventory", () => {
        it("should list both logical paths of a directory reached through an in-repo link", async () => {
            await writeAgent(`${root}/real/reviewer.md`);
            await symlink(
                join(repoRoot, ...root.split("/"), "real"),
                join(repoRoot, ...root.split("/"), "alias"),
            );

            const walk = await discover(repoRoot, {
                rootDirectoryName: "repo",
                purpose: "inventory",
            });

            expect(walk.files.map((file) => file.relativePath)).toEqual([
                `${root}/alias/reviewer.md`,
                `${root}/real/reviewer.md`,
            ]);
        });

        it("should still list a file whose name contains two dots", async () => {
            await writeAgent(`${root}/review..strict.md`);

            const walk = await discover(repoRoot, {
                rootDirectoryName: "repo",
            });

            expect(walk.files.map((file) => file.relativePath)).toEqual([
                `${root}/review..strict.md`,
            ]);
        });
    });
});

describe("lint discovery of a skill catalog", () => {
    let workDir = "";

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it("should not enter a symbolic link to a skill directory", async () => {
        workDir = await realpath(
            await mkdtemp(join(tmpdir(), "skill-discovery-")),
        );
        await mkdir(join(workDir, "real"), { recursive: true });
        await writeFile(join(workDir, "real", "SKILL.md"), "# skill\n");
        await mkdir(join(workDir, ".claude", "skills"), { recursive: true });
        await symlink(
            join(workDir, "real"),
            join(workDir, ".claude", "skills", "linked"),
        );

        const walk = await discoverSkillFiles(workDir, {
            rootDirectoryName: "repo",
            purpose: "lint",
        });

        expect(walk.files).toEqual([]);
    });
});

describe("collapseToFirstRealFile", () => {
    it("should keep the first logical path in code-unit order for one real file", () => {
        const identity = { dev: 1, ino: 2 };
        const files: WalkedFile[] = [
            {
                relativePath: ".github/instructions/b-alias/x.instructions.md",
                real: "/shared/x.instructions.md",
                identity,
            },
            {
                relativePath: ".github/instructions/a-alias/x.instructions.md",
                real: "/shared/x.instructions.md",
                identity,
            },
        ];

        expect(
            collapseToFirstRealFile(files).map((file) => file.relativePath),
        ).toEqual([".github/instructions/a-alias/x.instructions.md"]);
    });

    describe("when one real file has a preferred path that sorts after its alias", () => {
        it("should keep the preferred path", () => {
            const identity = { dev: 1, ino: 2 };
            const preferredPath = "pkg/CLAUDE.md";
            const aliasPath = ".github/instructions/x/CLAUDE.md";
            const real = "/repo/pkg/CLAUDE.md";
            const files: WalkedFile[] = [
                { relativePath: aliasPath, real, identity },
                { relativePath: preferredPath, real, identity },
            ];

            const kept = collapseToFirstRealFile(
                files,
                (file) => file.relativePath === preferredPath,
            );

            expect(kept.map((file) => file.relativePath)).toEqual([
                preferredPath,
            ]);
        });
    });

    describe("when two real files are hard links to one inode", () => {
        it("should keep both paths, because each is a file a harness loads", () => {
            const sharedInode = { dev: 1, ino: 2 };
            const firstPath = "lib/CLAUDE.md";
            const secondPath = "pkg/CLAUDE.md";
            const files: WalkedFile[] = [
                {
                    relativePath: secondPath,
                    real: `/repo/${secondPath}`,
                    identity: sharedInode,
                },
                {
                    relativePath: firstPath,
                    real: `/repo/${firstPath}`,
                    identity: sharedInode,
                },
            ];

            const kept = collapseToFirstRealFile(files);

            expect(kept.map((file) => file.relativePath)).toEqual([
                firstPath,
                secondPath,
            ]);
        });
    });
});
