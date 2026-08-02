import {
    link,
    mkdir,
    realpath,
    rm,
    stat,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsSafeError, root } from "@openclaw/fs-safe";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    assertFileSizeWithinLimit,
    assertPathHasNoSymbolicLinks,
    listDirectoryWithinRoot,
    pathExistsWithinRoot,
    readFileNoFollow,
    readTextWithinRoot,
    statWithinRoot,
} from "./file-system-utils.js";

vi.mock("@openclaw/fs-safe", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@openclaw/fs-safe")>();
    return {
        ...actual,
        root: vi.fn(actual.root),
    };
});

const chance = new Chance();

describe("readFileNoFollow", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-test-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("given a regular file within the size limit", () => {
        it("should return the file content", async () => {
            const filePath = join(testDir, "valid.txt");
            const content = chance.paragraph();
            await writeFile(filePath, content);

            const result = await readFileNoFollow(filePath, 1_048_576);

            expect(result).toBe(content);
        });
    });

    describe("given an empty file", () => {
        it("should return an empty string", async () => {
            const filePath = join(testDir, "empty.txt");
            await writeFile(filePath, "");

            const result = await readFileNoFollow(filePath, 1_048_576);

            expect(result).toBe("");
        });
    });

    describe("given a file at exactly the size limit", () => {
        it("should return the file content", async () => {
            const filePath = join(testDir, "exact.txt");
            const maxBytes = 100;
            const content = "x".repeat(maxBytes);
            await writeFile(filePath, content);

            const result = await readFileNoFollow(filePath, maxBytes);

            expect(result).toBe(content);
        });
    });

    describe("given a file exceeding the size limit", () => {
        it("should reject with a size limit error", async () => {
            const filePath = join(testDir, "oversized.txt");
            const maxBytes = 100;
            const content = "x".repeat(maxBytes + 1);
            await writeFile(filePath, content);

            await expect(readFileNoFollow(filePath, maxBytes)).rejects.toThrow(
                "exceeds size limit",
            );
        });
    });

    describe("given a symbolic link to a regular file", () => {
        it.skipIf(process.platform === "win32")(
            "should reject with a symlink error",
            async () => {
                const realFile = join(testDir, "real.txt");
                const linkFile = join(testDir, "link.txt");
                await writeFile(realFile, "content");
                await symlink(realFile, linkFile);

                await expect(
                    readFileNoFollow(linkFile, 1_048_576),
                ).rejects.toThrow("Symlinks are not allowed");
            },
        );
    });

    describe("given a non-existent file", () => {
        it("should reject with an ENOENT error", async () => {
            const filePath = join(testDir, "nonexistent.txt");

            await expect(
                readFileNoFollow(filePath, 1_048_576),
            ).rejects.toThrow();
        });
    });

    describe("error message sanitization", () => {
        it.skipIf(process.platform === "win32")(
            "should not reflect raw control characters in symlink errors",
            async () => {
                const realFile = join(testDir, "real.txt");
                const linkFile = join(testDir, "link-\x1b[2J.txt");
                await writeFile(realFile, "content");

                try {
                    await symlink(realFile, linkFile);
                } catch {
                    return;
                }

                try {
                    await readFileNoFollow(linkFile, 1_048_576);
                } catch (error: unknown) {
                    const message = (error as Error).message;
                    expect(message).not.toContain("\x1b");
                    return;
                }
                expect.unreachable("expected an error to be thrown");
            },
        );
    });
});

describe("readTextWithinRoot", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-root-test-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("given a relative file path inside the root", () => {
        it("should return the file content", async () => {
            const content = chance.sentence();
            await writeFile(join(testDir, "config.json"), content);

            const result = await readTextWithinRoot(
                testDir,
                "config.json",
                1_048_576,
            );

            expect(result).toBe(content);
        });
    });

    describe("given a traversal path", () => {
        it("should reject before reading outside the root", async () => {
            await expect(
                readTextWithinRoot(testDir, "../outside.txt", 1_048_576),
            ).rejects.toThrow("outside target directory");
        });
    });

    describe("given a symlinked file", () => {
        it.skipIf(process.platform === "win32")(
            "should reject the symlink",
            async () => {
                await writeFile(join(testDir, "real.txt"), chance.sentence());
                await symlink(
                    join(testDir, "real.txt"),
                    join(testDir, "link.txt"),
                );

                await expect(
                    readTextWithinRoot(testDir, "link.txt", 1_048_576),
                ).rejects.toThrow("Symlinks are not allowed");
            },
        );
    });
});

describe("listDirectoryWithinRoot", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-list-test-${chance.hash({ length: 8 })}`,
        );
        await mkdir(join(testDir, "nested"), { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("given a directory inside the root", () => {
        it("should return directory entries", async () => {
            await writeFile(join(testDir, "nested", "one.md"), "");
            await writeFile(join(testDir, "nested", "two.txt"), "");

            const entries = await listDirectoryWithinRoot(testDir, "nested");

            expect(entries.map((entry) => entry.name).sort()).toEqual([
                "one.md",
                "two.txt",
            ]);
        });
    });

    describe("given the root relative path", () => {
        it("should list entries for '.'", async () => {
            await writeFile(join(testDir, "nested", "one.md"), "");

            const entries = await listDirectoryWithinRoot(testDir, ".");

            expect(entries.map((entry) => entry.name)).toContain("nested");
        });
    });

    describe("given a symlinked directory", () => {
        it.skipIf(process.platform === "win32")(
            "should reject with a symlinks-not-allowed error",
            async () => {
                const realDir = join(testDir, "real-nested");
                await mkdir(realDir, { recursive: true });
                await writeFile(join(realDir, "one.md"), "");
                await symlink(realDir, join(testDir, "nested-link"));

                await expect(
                    listDirectoryWithinRoot(testDir, "nested-link"),
                ).rejects.toThrow(/symlinks are not allowed/i);
            },
        );
    });
});

describe("pathExistsWithinRoot", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-exists-test-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("given a missing path inside the root", () => {
        it("should return false", async () => {
            const exists = await pathExistsWithinRoot(testDir, "missing.txt");

            expect(exists).toBe(false);
        });
    });

    describe("given the root relative path", () => {
        it("should return true for '.'", async () => {
            const exists = await pathExistsWithinRoot(testDir, ".");

            expect(exists).toBe(true);
        });
    });

    describe("given a traversal path", () => {
        it("should reject instead of returning false", async () => {
            await expect(
                pathExistsWithinRoot(testDir, "../missing.txt"),
            ).rejects.toThrow("outside target directory");
        });
    });

    describe("given a symlinked file", () => {
        it.skipIf(process.platform === "win32")(
            "should reject with a symlinks-not-allowed error",
            async () => {
                await writeFile(join(testDir, "real.txt"), chance.word());
                await symlink(
                    join(testDir, "real.txt"),
                    join(testDir, "link.txt"),
                );

                await expect(
                    pathExistsWithinRoot(testDir, "link.txt"),
                ).rejects.toThrow(/symlinks are not allowed/i);
            },
        );
    });
});

describe("createSafeRoot policy", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-policy-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
        await writeFile(join(testDir, "file.txt"), chance.word());
        vi.mocked(root).mockClear();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("should open roots with hardlinks and symlinks rejected", async () => {
        await readTextWithinRoot(testDir, "file.txt", 1_048_576);

        expect(root).toHaveBeenCalledWith(
            testDir,
            expect.objectContaining({
                hardlinks: "reject",
                symlinks: "reject",
            }),
        );
    });
});

describe("mapFsSafeError via readTextWithinRoot", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-maperr-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
        await writeFile(join(testDir, "file.txt"), chance.word());
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
        vi.mocked(root).mockImplementation(
            (
                await vi.importActual<typeof import("@openclaw/fs-safe")>(
                    "@openclaw/fs-safe",
                )
            ).root,
        );
    });

    it("should map FsSafeError symlink codes to a symlink-not-allowed message", async () => {
        vi.mocked(root).mockResolvedValue({
            readText: async () => {
                throw new FsSafeError("symlink", "symlink open blocked");
            },
        } as Awaited<ReturnType<typeof root>>);

        await expect(
            readTextWithinRoot(testDir, "file.txt", 1_048_576),
        ).rejects.toThrow(/symlinks are not allowed/i);
    });

    it("should map FsSafeError path-alias codes to a symlink-not-allowed message", async () => {
        vi.mocked(root).mockResolvedValue({
            readText: async () => {
                throw new FsSafeError("path-alias", "alias escaped root");
            },
        } as Awaited<ReturnType<typeof root>>);

        await expect(
            readTextWithinRoot(testDir, "file.txt", 1_048_576),
        ).rejects.toThrow(/symlinks are not allowed/i);
    });

    it("should map FsSafeError too-large codes to a size limit message", async () => {
        vi.mocked(root).mockResolvedValue({
            readText: async () => {
                throw new FsSafeError("too-large", "budget exceeded");
            },
        } as Awaited<ReturnType<typeof root>>);

        await expect(
            readTextWithinRoot(testDir, "file.txt", 1_048_576),
        ).rejects.toThrow(/exceeds size limit/i);
    });
});

describe("assertFileSizeWithinLimit", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-size-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("given a file at exactly the size limit", () => {
        it("should resolve without throwing", async () => {
            const maxBytes = 64;
            const filePath = join(testDir, "exact.bin");
            await writeFile(filePath, "x".repeat(maxBytes));

            await expect(
                assertFileSizeWithinLimit(filePath, maxBytes, "fixture"),
            ).resolves.toBeUndefined();
        });
    });

    describe("given a file one byte over the size limit", () => {
        it("should reject with a size limit error", async () => {
            const maxBytes = 64;
            const filePath = join(testDir, "over.bin");
            await writeFile(filePath, "x".repeat(maxBytes + 1));

            await expect(
                assertFileSizeWithinLimit(filePath, maxBytes, "fixture"),
            ).rejects.toThrow(/exceeds size limit/i);
        });
    });
});

describe("assertPathHasNoSymbolicLinks", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-assert-symlink-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("given the root path itself", () => {
        it("should resolve without throwing", async () => {
            const rootPath = await realpath(testDir);

            await expect(
                assertPathHasNoSymbolicLinks(testDir, rootPath),
            ).resolves.toBeUndefined();
        });
    });
});

describe("readTextWithinRoot hardlink policy", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-hardlink-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
        vi.mocked(root).mockImplementation(
            (
                await vi.importActual<typeof import("@openclaw/fs-safe")>(
                    "@openclaw/fs-safe",
                )
            ).root,
        );
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it.skipIf(process.platform === "win32")(
        "should reject a hardlinked file when hardlinks are rejected",
        async () => {
            const realFile = join(testDir, "real.txt");
            const hardLink = join(testDir, "hard.txt");
            await writeFile(realFile, chance.sentence());
            await link(realFile, hardLink);

            await expect(
                readTextWithinRoot(testDir, "hard.txt", 1_048_576),
            ).rejects.toThrow();
        },
    );
});

describe("statWithinRoot", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `file-system-utils-stat-test-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("given a regular file within the root", () => {
        it("should return stat with isFile true and correct size", async () => {
            const content = chance.paragraph();
            await writeFile(join(testDir, "file.txt"), content);

            const result = await statWithinRoot(testDir, "file.txt");

            expect(result.isFile).toBe(true);
            expect(result.isDirectory).toBe(false);
            expect(result.size).toBe(Buffer.byteLength(content));
        });

        it("should return a numeric mtimeMs representing the modification time", async () => {
            await writeFile(join(testDir, "file.txt"), chance.word());
            const reference = await stat(join(testDir, "file.txt"));

            const result = await statWithinRoot(testDir, "file.txt");

            expect(typeof result.mtimeMs).toBe("number");
            // Same file, same source — but Node derives mtimeMs as a float
            // from the nanosecond timestamp and it is not bit-stable across
            // stat calls, so compare to the nearest millisecond.
            expect(result.mtimeMs).toBeCloseTo(reference.mtimeMs, 0);
        });
    });

    describe("given a directory within the root", () => {
        it("should return stat with isDirectory true", async () => {
            await mkdir(join(testDir, "subdir"));

            const result = await statWithinRoot(testDir, "subdir");

            expect(result.isDirectory).toBe(true);
            expect(result.isFile).toBe(false);
        });
    });

    describe("given a traversal path", () => {
        it("should reject with an outside-root error", async () => {
            await expect(
                statWithinRoot(testDir, "../outside.txt"),
            ).rejects.toThrow("outside target directory");
        });
    });

    describe("given a symlink within the root", () => {
        it("should reject with a symlinks-not-allowed error", async () => {
            const target = join(testDir, "real.txt");
            await writeFile(target, "content");
            await symlink(target, join(testDir, "link.txt"));

            await expect(statWithinRoot(testDir, "link.txt")).rejects.toThrow(
                /symlinks are not allowed/i,
            );
        });
    });
});
