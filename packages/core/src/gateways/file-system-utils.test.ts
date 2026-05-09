import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    listDirectoryWithinRoot,
    pathExistsWithinRoot,
    readFileNoFollow,
    readTextWithinRoot,
    statWithinRoot,
} from "./file-system-utils.js";

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

    describe("given a traversal path", () => {
        it("should reject instead of returning false", async () => {
            await expect(
                pathExistsWithinRoot(testDir, "../missing.txt"),
            ).rejects.toThrow("outside target directory");
        });
    });
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
            const before = Date.now();
            await writeFile(join(testDir, "file.txt"), chance.word());

            const result = await statWithinRoot(testDir, "file.txt");

            expect(typeof result.mtimeMs).toBe("number");
            expect(result.mtimeMs).toBeGreaterThanOrEqual(before - 1);
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
