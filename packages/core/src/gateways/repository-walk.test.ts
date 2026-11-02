import {
    chmod,
    mkdir,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listDirectoryWithinRoot } from "./file-system-utils.js";
import {
    DEFAULT_MAX_WALK_DEPTH,
    DEFAULT_MAX_WALK_DIRECTORIES,
    DEFAULT_MAX_WALK_ENTRIES,
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
            await write("AGENTS.md");
            await write("packages/a/CLAUDE.md");

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(found).toEqual(["AGENTS.md", "packages/a/CLAUDE.md"]);
        });

        it("should return only files accepted by includeFile", async () => {
            await write("keep.md");
            await write("skip.txt");

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(found).toEqual(["keep.md"]);
        });

        it("should report both the logical path and the real path of a file", async () => {
            await write("real/target.md");
            await symlink("real/target.md", join(root, "link.md"));

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            const linked = result.files.find(
                (f) => f.relativePath === "link.md",
            );
            expect(linked?.real).toBe(join(root, "real", "target.md"));
        });
    });

    describe("when starting below the root", () => {
        it("should walk only that directory and report paths from the root", async () => {
            await write(".github/instructions/a.md");
            await write("elsewhere/b.md");

            const found = await paths({
                startRelativePath: ".github/instructions",
                includeFile: isMarkdown,
            });

            expect(found).toEqual([".github/instructions/a.md"]);
        });

        it("should list only the start directory when subdirectories are not included", async () => {
            await write("top.md");
            await write("sub/nested.md");

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                includeSubdirectories: false,
            });

            expect(found).toEqual(["top.md"]);
        });
    });

    describe("when directories are skipped", () => {
        it("should skip node_modules and .git at any depth by default", async () => {
            await write("node_modules/pkg/CLAUDE.md");
            await write("a/node_modules/CLAUDE.md");
            await write(".git/CLAUDE.md");
            await write("a/CLAUDE.md");

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(found).toEqual(["a/CLAUDE.md"]);
        });

        it("should use the skip list a caller supplies instead of the default", async () => {
            await write("dist/a.md");
            await write("node_modules/b.md");

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                skipDirectoryNames: ["dist"],
            });

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
                const expected = await nested(depth);

                const found = await paths({
                    startRelativePath: "",
                    includeFile: isMarkdown,
                });

                expect(found).toEqual([expected]);
            },
        );

        it("should not list a directory at depth 11 below the root", async () => {
            await nested(11);

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(found).toEqual([]);
        });

        it("should honor a maxDepth the caller supplies", async () => {
            await write("a/b/deep.md");
            await write("a/shallow.md");

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDepth: 1,
            });

            expect(found).toEqual(["a/shallow.md"]);
        });
    });

    describe("symlinks", () => {
        it("should follow a directory symlink whose target stays inside the root", async () => {
            await write("real/x.md");
            await symlink("real", join(root, "linkdir"));

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "refuse-ancestors",
            });

            expect(found).toEqual(["linkdir/x.md", "real/x.md"]);
        });

        it("should not follow a symlink that leaves the root", async () => {
            await writeFile(join(outside, "secret.md"), "secret");
            await symlink(outside, join(root, "escape"));
            await symlink(join(outside, "secret.md"), join(root, "escape.md"));
            await write("kept.md");

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(found).toEqual(["kept.md"]);
        });
    });

    describe("cycles", () => {
        it.each(["once-per-real-directory", "refuse-ancestors"] as const)(
            "should terminate on a directory that links to itself and list its file once under %s",
            async (revisit) => {
                await write("a/x.md");
                await symlink(".", join(root, "a", "loop"));

                const found = await paths({
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    revisit,
                });

                expect(found).toEqual(["a/x.md"]);
            },
        );

        it.each(["once-per-real-directory", "refuse-ancestors"] as const)(
            "should terminate when two directories link to each other under %s",
            async (revisit) => {
                await write("a/x.md");
                await write("b/y.md");
                await symlink("../b", join(root, "a", "to-b"));
                await symlink("../a", join(root, "b", "to-a"));

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    revisit,
                });

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
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "once-per-real-directory",
            });

            expect(found).toEqual(["a/x.md"]);
        });

        it("should keep every path to the directory as a separate location with revisit refuse-ancestors", async () => {
            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "refuse-ancestors",
            });

            expect(found).toEqual(["a/x.md", "b/x.md", "shared/x.md"]);
        });
    });

    describe("determinism", () => {
        it("should report the same winning path whatever order the file system lists entries in", async () => {
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

            expect(first).toEqual(["linkdir/x.md"]);
            expect(second).toEqual(first);
        });

        it("should order names by code unit, not by locale: '-' < uppercase < '_' < lowercase", async () => {
            for (const name of ["a.md", "_x.md", "B.md", "-y.md"]) {
                await write(name);
            }

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(found).toEqual(["-y.md", "B.md", "_x.md", "a.md"]);
        });

        it("should return files in name order", async () => {
            await write("b.md");
            await write("a.md");
            await write("c/z.md");

            const found = await paths({
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(found).toEqual(["a.md", "b.md", "c/z.md"]);
        });
    });

    describe("entry budget", () => {
        function countingLister(): {
            lister: DirectoryLister;
            listed: () => number;
        } {
            let entries = 0;
            return {
                listed: () => entries,
                lister: async (rootReal, relativePath) => {
                    const found = await listDirectoryWithinRoot(
                        rootReal,
                        relativePath,
                    );
                    entries += found.length;
                    return found;
                },
            };
        }

        it("should stop and report it when a directory holds more entries than the budget", async () => {
            for (let n = 0; n < 20; n += 1) {
                await write(`f${String(n).padStart(2, "0")}.md`);
            }

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxEntries: 5,
            });

            expect(result.entryLimitReached).toBe(true);
            expect(result.files).toHaveLength(5);
            expect(result.directoryLimitReached).toBe(false);
        });

        it("should not report it when the tree has exactly as many entries as the budget", async () => {
            await write("a/one.md");
            await write("a/two.md");
            await write("b.md");

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxEntries: 4,
            });

            expect(result.entryLimitReached).toBe(false);
            expect(result.files).toHaveLength(3);
        });

        it("should bound the work of a fan-out of directory aliases, which the directory cap does not", async () => {
            await mkdir(join(root, "a"));
            await mkdir(join(root, "b"));
            await mkdir(join(root, "c"));
            for (let n = 0; n < 10; n += 1) {
                await write(`c/f${n}.md`);
                await symlink("../b", join(root, "a", `to-b${n}`));
                await symlink("../c", join(root, "b", `to-c${n}`));
            }
            const { lister, listed } = countingLister();

            const result = await walkRepository(root, {
                startRelativePath: "a",
                includeFile: isMarkdown,
                revisit: "refuse-ancestors",
                maxEntries: 100,
                listDirectory: lister,
            });

            expect(result.entryLimitReached).toBe(true);
            expect(result.directoryLimitReached).toBe(false);
            expect(listed()).toBeLessThanOrEqual(100 + 10);
        });

        it("should allow two hundred thousand entries by default", () => {
            expect(DEFAULT_MAX_WALK_ENTRIES).toBe(200_000);
        });

        it("should apply the default budget when none is given", async () => {
            await write("a.md");

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(result.limits).toEqual({
                maxDirectories: DEFAULT_MAX_WALK_DIRECTORIES,
                maxDepth: DEFAULT_MAX_WALK_DEPTH,
                maxEntries: DEFAULT_MAX_WALK_ENTRIES,
            });
        });
    });

    describe("a directory entry name that could escape its directory", () => {
        function listing(...names: string[]) {
            return async () => names.map((name) => ({ name }));
        }

        it.each([
            ["the current directory", "."],
            ["the parent directory", ".."],
        ])("should not spend entry budget on %s", async (_, name) => {
            await write("ok.md");

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxEntries: 1,
                listDirectory: listing(name, "ok.md"),
            });

            expect(result.files.map((f) => f.relativePath)).toEqual(["ok.md"]);
            expect(result.entryLimitReached).toBe(false);
        });

        it("should not follow a name that holds a forward slash into a subdirectory", async () => {
            await write("nested/inner.md");

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                listDirectory: listing("nested/inner.md"),
            });

            expect(result.files).toEqual([]);
        });

        it.skipIf(process.platform === "win32")(
            "should skip a name that holds a backslash",
            async () => {
                const name = "windows\\style.md";
                await write(name);

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    listDirectory: listing(name),
                });

                expect(result.files).toEqual([]);
            },
        );
    });

    describe("a file name with two dots in it", () => {
        it.each([
            "review..strict.md",
            "a..instructions.md",
            "..hidden.md",
            "trailing...md",
        ])("should find %s, which is an ordinary name", async (name) => {
            await write(name);

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(result.files.map((f) => f.relativePath)).toEqual([name]);
        });
    });

    describe("a directory that cannot be listed", () => {
        it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
            "should be skipped without failing the walk, and the files elsewhere should still be returned",
            async () => {
                await write("a/a.md");
                await write("b/b.md");
                await write("c/c.md");
                await chmod(join(root, "b"), 0o000);

                try {
                    const result = await walkRepository(root, {
                        startRelativePath: "",
                        includeFile: isMarkdown,
                    });

                    expect(result.files.map((f) => f.relativePath)).toEqual([
                        "a/a.md",
                        "c/c.md",
                    ]);
                    expect(result.directoryLimitReached).toBe(false);
                    expect(result.depthLimitReached).toBe(false);
                } finally {
                    await chmod(join(root, "b"), 0o755);
                }
            },
        );
    });

    describe.skipIf(process.platform === "win32")(
        "a symbolic link whose target is outside the repository",
        () => {
            async function link(
                relativePath: string,
                target: string,
            ): Promise<void> {
                const absolute = join(root, relativePath);
                await mkdir(join(absolute, ".."), { recursive: true });
                await symlink(target, absolute);
            }

            async function outsideFile(name = "target.md"): Promise<string> {
                const path = join(outside, name);
                await writeFile(path, "x");
                return path;
            }

            async function outsideDirectory(name = "dir"): Promise<string> {
                const path = join(outside, name);
                await mkdir(path, { recursive: true });
                return path;
            }

            it("should be reported, by its path in the repository, when it is a file the walk would have collected", async () => {
                await write("keep.md");
                await link("sub/out.md", await outsideFile());

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    includeSubdirectories: true,
                });

                expect(result.files.map((f) => f.relativePath)).toEqual([
                    "keep.md",
                ]);
                expect(result.skippedOutsideRoot).toEqual(["sub/out.md"]);
            });

            it("should be reported when it is a directory the walk would have entered", async () => {
                await link("shared", await outsideDirectory());

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    includeSubdirectories: true,
                });

                expect(result.skippedOutsideRoot).toEqual(["shared"]);
            });

            it("should be reported when it is the directory the walk starts from", async () => {
                await link("shared", await outsideDirectory());

                const result = await walkRepository(root, {
                    startRelativePath: "shared",
                    includeFile: isMarkdown,
                });

                expect(result.files).toEqual([]);
                expect(result.skippedOutsideRoot).toEqual(["shared"]);
            });

            it("should not be reported as a starting directory when it points at a file", async () => {
                await link("shared", await outsideFile());

                const result = await walkRepository(root, {
                    startRelativePath: "shared",
                    includeFile: isMarkdown,
                });

                expect(result.skippedOutsideRoot).toEqual([]);
            });

            it("should not be reported when the directory the walk starts from does not exist", async () => {
                const result = await walkRepository(root, {
                    startRelativePath: "absent",
                    includeFile: isMarkdown,
                });

                expect(result.skippedOutsideRoot).toEqual([]);
            });

            it("should not be reported when the walk does not enter subdirectories", async () => {
                await link("shared", await outsideDirectory());

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    includeSubdirectories: false,
                });

                expect(result.skippedOutsideRoot).toEqual([]);
            });

            it("should not be reported when it is a directory the walk skips by name", async () => {
                await link("node_modules", await outsideDirectory());

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    includeSubdirectories: true,
                });

                expect(result.skippedOutsideRoot).toEqual([]);
            });

            it("should not be reported when it is a file the walk would not have collected", async () => {
                await link("notes.txt", await outsideFile("notes.txt"));

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    includeSubdirectories: true,
                });

                expect(result.skippedOutsideRoot).toEqual([]);
            });

            it("should not be reported when it points at something that is neither a file nor a directory", async () => {
                await link("device.md", "/dev/null");

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    includeSubdirectories: true,
                });

                expect(result.skippedOutsideRoot).toEqual([]);
            });

            it("should not be reported when its target stays inside the repository", async () => {
                await write("real.md");
                await link("alias.md", join(root, "real.md"));

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    includeSubdirectories: true,
                });

                expect(result.skippedOutsideRoot).toEqual([]);
            });

            it("should be reported in the order the walk meets it, below the directory it starts from", async () => {
                await link("start/b.md", await outsideFile("b.md"));
                await link("start/a.md", await outsideFile("a.md"));
                await link("elsewhere/c.md", await outsideFile("c.md"));

                const result = await walkRepository(root, {
                    startRelativePath: "start",
                    includeFile: isMarkdown,
                });

                expect(result.skippedOutsideRoot).toEqual([
                    "start/a.md",
                    "start/b.md",
                ]);
            });
        },
    );

    describe("a root directory that does not exist", () => {
        it("should return no files and report no limit and no skipped link", async () => {
            const result = await walkRepository(join(root, "absent"), {
                startRelativePath: "",
                includeFile: isMarkdown,
            });

            expect(result).toEqual({
                files: [],
                directoryLimitReached: false,
                depthLimitReached: false,
                entryLimitReached: false,
                skippedOutsideRoot: [],
                limits: {
                    maxDirectories: DEFAULT_MAX_WALK_DIRECTORIES,
                    maxDepth: DEFAULT_MAX_WALK_DEPTH,
                    maxEntries: DEFAULT_MAX_WALK_ENTRIES,
                },
            });
        });
    });

    describe("an entry that cannot be inspected", () => {
        it.skipIf(process.platform === "win32")(
            "should be skipped without failing the walk, and the files beside it should still be returned",
            async () => {
                await write("a/a.md");
                await write("c/c.md");
                await symlink("loop.md", join(root, "a", "loop.md"));

                const result = await walkRepository(root, {
                    startRelativePath: "",
                    includeFile: isMarkdown,
                    includeSubdirectories: true,
                });

                expect(result.files.map((f) => f.relativePath)).toEqual([
                    "a/a.md",
                    "c/c.md",
                ]);
                expect(result.directoryLimitReached).toBe(false);
                expect(result.depthLimitReached).toBe(false);
                expect(result.entryLimitReached).toBe(false);
            },
        );
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

        it("should list the root, a and b when capped at three directories, and refuse c", async () => {
            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDirectories: 3,
            });

            expect(result.files.map((f) => f.relativePath)).toEqual([
                "a/a.md",
                "b/b.md",
            ]);
            expect(result.directoryLimitReached).toBe(true);
        });

        it("should list every directory and report no limit when the tree has exactly the capped number", async () => {
            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDirectories: 4,
            });

            expect(result.files.map((f) => f.relativePath)).toEqual([
                "a/a.md",
                "b/b.md",
                "c/c.md",
            ]);
            expect(result.directoryLimitReached).toBe(false);
        });

        it("should count only the root, a, b and c against the cap, not skipped directories or cycle revisits", async () => {
            await write("node_modules/x/y.md");
            await write(".git/z.md");
            await symlink(".", join(root, "a", "loop"));

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDirectories: 4,
            });

            expect(result.directoryLimitReached).toBe(false);
            expect(result.files).toHaveLength(3);
        });

        it("should keep the files found before the cap and never throw", async () => {
            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                maxDirectories: 1,
            });

            expect(result.files).toEqual([]);
            expect(result.directoryLimitReached).toBe(true);
        });
    });

    describe("fan-out through directory aliases", () => {
        it("should bound a fan-out of aliases with the cap, because refusing ancestors alone does not, when each level links to the next three times (81 paths)", async () => {
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

            const result = await walkRepository(root, {
                startRelativePath: "",
                includeFile: isMarkdown,
                revisit: "refuse-ancestors",
                maxDirectories: 20,
            });

            expect(result.directoryLimitReached).toBe(true);
            expect(result.files).toHaveLength(19);
        });
    });
});
