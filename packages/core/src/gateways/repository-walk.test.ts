import { mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    DEFAULT_MAX_WALK_DEPTH,
    DEFAULT_MAX_WALK_DIRECTORIES,
    type DirectoryLister,
    walkRepository,
} from "./repository-walk.js";

const chance = new Chance();

const isMarkdown = (name: string) => name.endsWith(".md");

describe("walkRepository", () => {
    let root: string;
    let outside: string;

    beforeEach(async () => {
        const base = join(tmpdir(), `repository-walk-${chance.guid()}`);
        root = join(base, "root");
        outside = join(base, "outside");
        await mkdir(root, { recursive: true });
        await mkdir(outside, { recursive: true });
        root = await realpath(root);
        outside = await realpath(outside);
    });

    afterEach(async () => {
        await rm(join(root, ".."), { recursive: true, force: true });
    });

    async function write(relativePath: string, content = "x"): Promise<void> {
        const absolute = join(root, relativePath);
        await mkdir(join(absolute, ".."), { recursive: true });
        await writeFile(absolute, content);
    }

    async function paths(
        options: Parameters<typeof walkRepository>[1],
    ): Promise<string[]> {
        const result = await walkRepository(root, options);
        return result.files.map((file) => file.relativePath);
    }

    describe("defaults", () => {
        it("should walk 10 levels below the start directory and list 10,000 directories", () => {
            expect(DEFAULT_MAX_WALK_DEPTH).toBe(10);
            expect(DEFAULT_MAX_WALK_DIRECTORIES).toBe(10_000);
        });
    });

    describe("when walking from the repository root", () => {
        it("should report repository-relative paths without a leading slash", async () => {
            // Arrange
            await write("AGENTS.md");
            await write("packages/a/CLAUDE.md");

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            // Assert
            expect(found).toEqual(["AGENTS.md", "packages/a/CLAUDE.md"]);
        });

        it("should return only files accepted by includeFile", async () => {
            // Arrange
            await write("keep.md");
            await write("skip.txt");

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            // Assert
            expect(found).toEqual(["keep.md"]);
        });

        it("should report both the logical path and the real path of a file", async () => {
            // Arrange
            await write("real/target.md");
            await symlink("real/target.md", join(root, "link.md"));

            // Act
            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            // Assert
            const linked = result.files.find(
                (f) => f.relativePath === "link.md",
            );
            expect(linked?.real).toBe(join(root, "real", "target.md"));
        });
    });

    describe("when starting below the root", () => {
        it("should walk only that directory and report paths from the root", async () => {
            // Arrange
            await write(".github/instructions/a.md");
            await write("elsewhere/b.md");

            // Act
            const found = await paths({
                startRelativePath: ".github/instructions",
                includeFile: isMarkdown,
            });

            // Assert
            expect(found).toEqual([".github/instructions/a.md"]);
        });

        it("should list only the start directory when subdirectories are not included", async () => {
            // Arrange
            await write("top.md");
            await write("sub/nested.md");

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                includeSubdirectories: false,
            });

            // Assert
            expect(found).toEqual(["top.md"]);
        });
    });

    describe("when directories are skipped", () => {
        it("should skip node_modules and .git at any depth by default", async () => {
            // Arrange
            await write("node_modules/pkg/CLAUDE.md");
            await write("a/node_modules/CLAUDE.md");
            await write(".git/CLAUDE.md");
            await write("a/CLAUDE.md");

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            // Assert
            expect(found).toEqual(["a/CLAUDE.md"]);
        });

        it("should use the skip list a caller supplies instead of the default", async () => {
            // Arrange
            await write("dist/a.md");
            await write("node_modules/b.md");

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                skipDirectoryNames: ["dist"],
            });

            // Assert
            expect(found).toEqual(["node_modules/b.md"]);
        });
    });

    describe("depth boundary", () => {
        async function nested(depth: number): Promise<string> {
            const directory = Array.from(
                { length: depth },
                (_, index) => `d${index + 1}`,
            ).join("/");
            await write(`${directory}/CLAUDE.md`);
            return `${directory}/CLAUDE.md`;
        }

        it.each([9, 10])(
            "should list a directory at depth %s below the root",
            async (depth) => {
                // Arrange
                const expected = await nested(depth);

                // Act
                const found = await paths({
                    startRelativePath: "",
                    includeFile: isMarkdown,
                });

                // Assert
                expect(found).toEqual([expected]);
            },
        );

        it("should not list a directory at depth 11 below the root", async () => {
            // Arrange
            await nested(11);

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            // Assert
            expect(found).toEqual([]);
        });

        it("should honor a maxDepth the caller supplies", async () => {
            // Arrange
            await write("a/b/deep.md");
            await write("a/shallow.md");

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDepth: 1,
            });

            // Assert
            expect(found).toEqual(["a/shallow.md"]);
        });
    });

    describe("symlinks", () => {
        it("should follow a directory symlink whose target stays inside the root", async () => {
            // Arrange
            await write("real/x.md");
            await symlink("real", join(root, "linkdir"));

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "refuse-ancestors",
            });

            // Assert
            expect(found).toEqual(["linkdir/x.md", "real/x.md"]);
        });

        it("should not follow a symlink that leaves the root", async () => {
            // Arrange
            await writeFile(join(outside, "secret.md"), "secret");
            await symlink(outside, join(root, "escape"));
            await symlink(join(outside, "secret.md"), join(root, "escape.md"));
            await write("kept.md");

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            // Assert
            expect(found).toEqual(["kept.md"]);
        });
    });

    describe("cycles", () => {
        it.each(["once-per-real-directory", "refuse-ancestors"] as const)(
            "should terminate on a directory that links to itself and list its file once under %s",
            async (revisit) => {
                // Arrange
                await write("a/x.md");
                await symlink(".", join(root, "a", "loop"));

                // Act
                const found = await paths({
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    revisit,
                });

                // Assert
                expect(found).toEqual(["a/x.md"]);
            },
        );

        it.each(["once-per-real-directory", "refuse-ancestors"] as const)(
            "should terminate when two directories link to each other under %s",
            async (revisit) => {
                // Arrange
                await write("a/x.md");
                await write("b/y.md");
                await symlink("../b", join(root, "a", "to-b"));
                await symlink("../a", join(root, "b", "to-a"));

                // Act
                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    revisit,
                });

                // Assert
                expect(result.directoryLimitReached).toBe(false);
                expect(result.files.map((f) => f.real)).toEqual(
                    expect.arrayContaining([
                        join(root, "a", "x.md"),
                        join(root, "b", "y.md"),
                    ]),
                );
            },
        );
    });

    describe("two paths to one directory (an alias that is not a cycle)", () => {
        beforeEach(async () => {
            await write("shared/x.md");
            await symlink("shared", join(root, "a"));
            await symlink("shared", join(root, "b"));
        });

        it("should list a real directory once, under the first path in name order, with revisit once-per-real-directory", async () => {
            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "once-per-real-directory",
            });

            // Assert
            expect(found).toEqual(["a/x.md"]);
        });

        it("should keep every path to the directory as a separate location with revisit refuse-ancestors", async () => {
            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "refuse-ancestors",
            });

            // Assert
            expect(found).toEqual(["a/x.md", "b/x.md", "shared/x.md"]);
        });
    });

    describe("determinism", () => {
        it("should report the same winning path whatever order the file system lists entries in", async () => {
            // Arrange: `linkdir` and `real` are two paths to one directory
            await write("real/x.md");
            await symlink("real", join(root, "linkdir"));
            const listFor =
                (reverse: boolean): DirectoryLister =>
                async (_root, relative) => {
                    if (relative !== "") {
                        return [{ name: "x.md" }];
                    }
                    return reverse
                        ? [{ name: "real" }, { name: "linkdir" }]
                        : [{ name: "linkdir" }, { name: "real" }];
                };

            // Act
            const first = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "once-per-real-directory",
                listDirectory: listFor(false),
            });
            const second = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "once-per-real-directory",
                listDirectory: listFor(true),
            });

            // Assert
            expect(first).toEqual(["linkdir/x.md"]);
            expect(second).toEqual(first);
        });

        it("should return files in name order", async () => {
            // Arrange
            await write("b.md");
            await write("a.md");
            await write("c/z.md");

            // Act
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            // Assert
            expect(found).toEqual(["a.md", "b.md", "c/z.md"]);
        });
    });

    describe("depth cap reporting", () => {
        const chain = (levels: number) =>
            Array.from({ length: levels }, (_, level) => `d${level}`).join("/");

        it("should report that a directory was left unentered below the depth limit", async () => {
            await write(`${chain(DEFAULT_MAX_WALK_DEPTH + 2)}/deep.md`);

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(result.depthLimitReached).toBe(true);
            expect(result.directoryLimitReached).toBe(false);
        });

        it("should not report it when the deepest directory is exactly at the depth limit", async () => {
            await write(`${chain(DEFAULT_MAX_WALK_DEPTH)}/edge.md`);

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(result.depthLimitReached).toBe(false);
            expect(result.files.map((f) => f.relativePath)).toEqual([
                `${chain(DEFAULT_MAX_WALK_DEPTH)}/edge.md`,
            ]);
        });

        it("should report it when only one directory is one level too deep", async () => {
            await write(`${chain(DEFAULT_MAX_WALK_DEPTH + 1)}/deep.md`);

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(result.depthLimitReached).toBe(true);
        });

        it("should not report it for a skipped directory below the depth limit", async () => {
            await write(`${chain(DEFAULT_MAX_WALK_DEPTH)}/node_modules/x.md`);

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(result.depthLimitReached).toBe(false);
        });

        it("should not report it when the walk does not descend into subdirectories at all", async () => {
            await write("a/b/c.md");

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                includeSubdirectories: false,
            });

            expect(result.depthLimitReached).toBe(false);
        });

        it("should not report it for an alias of a directory that was already listed", async () => {
            await write(`${chain(DEFAULT_MAX_WALK_DEPTH)}/edge.md`);
            await symlink(
                join(root, chain(DEFAULT_MAX_WALK_DEPTH)),
                join(root, chain(DEFAULT_MAX_WALK_DEPTH), "again"),
            );

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(result.depthLimitReached).toBe(false);
        });

        it("should not report it for a depth limit of zero when subdirectories are not walked", async () => {
            await write("a/b.md");

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                includeSubdirectories: false,
                maxDepth: 0,
            });

            expect(result.depthLimitReached).toBe(false);
        });

        it("should honor a depth limit passed in the options", async () => {
            await write("a/b/c/d.md");

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDepth: 2,
            });

            expect(result.depthLimitReached).toBe(true);
            expect(result.files).toEqual([]);
        });
    });

    describe("directory cap", () => {
        beforeEach(async () => {
            await write("a/a.md");
            await write("b/b.md");
            await write("c/c.md");
        });

        it("should list exactly the capped number of directories and refuse the next", async () => {
            // Act: root, a and b are listed; c is refused
            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDirectories: 3,
            });

            // Assert
            expect(result.files.map((f) => f.relativePath)).toEqual([
                "a/a.md",
                "b/b.md",
            ]);
            expect(result.directoryLimitReached).toBe(true);
        });

        it("should list every directory and report no limit when the tree has exactly the capped number", async () => {
            // Act
            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDirectories: 4,
            });

            // Assert
            expect(result.files.map((f) => f.relativePath)).toEqual([
                "a/a.md",
                "b/b.md",
                "c/c.md",
            ]);
            expect(result.directoryLimitReached).toBe(false);
        });

        it("should not count skipped directories or cycle revisits against the cap", async () => {
            // Arrange
            await write("node_modules/x/y.md");
            await write(".git/z.md");
            await symlink(".", join(root, "a", "loop"));

            // Act: only root, a, b and c count
            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDirectories: 4,
            });

            // Assert
            expect(result.directoryLimitReached).toBe(false);
            expect(result.files).toHaveLength(3);
        });

        it("should keep the files found before the cap and never throw", async () => {
            // Act
            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDirectories: 1,
            });

            // Assert
            expect(result.files).toEqual([]);
            expect(result.directoryLimitReached).toBe(true);
        });
    });

    describe("fan-out through directory aliases", () => {
        it("should stop at the cap when each level links to the next three times (81 paths)", async () => {
            // Arrange: d0 -> 3 links to d1 -> 3 links to d2 ... -> d4.
            // Every path is a different logical location, so refusing only
            // ancestors does not bound the walk; the cap must.
            const levels = 5;
            for (let level = 0; level < levels; level += 1) {
                await write(`d${level}/f.md`);
                if (level < levels - 1) {
                    for (const name of ["l1", "l2", "l3"]) {
                        await symlink(
                            `../d${level + 1}`,
                            join(root, `d${level}`, name),
                        );
                    }
                }
            }

            // Act
            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "refuse-ancestors",
                maxDirectories: 20,
            });

            // Assert
            expect(result.directoryLimitReached).toBe(true);
            expect(result.files).toHaveLength(19);
        });
    });
});
