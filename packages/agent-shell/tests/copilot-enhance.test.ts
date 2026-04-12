import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    readProjectFileSafe,
    resolveSafePath,
} from "../src/use-cases/copilot-enhance.js";

describe("resolveSafePath", () => {
    const repoRoot = "/home/user/project";

    describe("given a valid relative path within the repository", () => {
        it("should resolve to the absolute path", () => {
            const result = resolveSafePath(repoRoot, "src/index.ts");

            expect(result).toBe("/home/user/project/src/index.ts");
        });
    });

    describe("given a nested relative path", () => {
        it("should resolve correctly", () => {
            const result = resolveSafePath(
                repoRoot,
                "packages/cli/src/main.ts",
            );

            expect(result).toBe("/home/user/project/packages/cli/src/main.ts");
        });
    });

    describe("given a dot path referencing the root", () => {
        it("should resolve to the repository root", () => {
            const result = resolveSafePath(repoRoot, ".");

            expect(result).toBe(repoRoot);
        });
    });

    describe("given a path with parent traversal escaping the root", () => {
        it("should return null", () => {
            const result = resolveSafePath(repoRoot, "../../etc/passwd");

            expect(result).toBeNull();
        });
    });

    describe("given a path that normalizes to above the root", () => {
        it("should return null", () => {
            const result = resolveSafePath(
                repoRoot,
                "src/../../../../../../etc/shadow",
            );

            expect(result).toBeNull();
        });
    });

    describe("given an absolute path outside the repository", () => {
        it("should return null", () => {
            const result = resolveSafePath(repoRoot, "/etc/passwd");

            expect(result).toBeNull();
        });
    });

    describe("given a path with redundant dots that stays within root", () => {
        it("should resolve correctly", () => {
            const result = resolveSafePath(repoRoot, "src/../package.json");

            expect(result).toBe("/home/user/project/package.json");
        });
    });

    describe("given a repoRoot with trailing slash", () => {
        it("should still resolve correctly", () => {
            const result = resolveSafePath(
                "/home/user/project/",
                "src/index.ts",
            );

            expect(result).toBe("/home/user/project/src/index.ts");
        });
    });

    describe("given filesystem root as repoRoot", () => {
        it("should resolve paths correctly without collapsing root to empty string", () => {
            const result = resolveSafePath("/", "../../etc/passwd");

            expect(result).toBe("/etc/passwd");
        });

        it("should resolve valid paths within root", () => {
            const result = resolveSafePath("/", "home/user/file.txt");

            expect(result).toBe("/home/user/file.txt");
        });

        it("should resolve parent traversal to root itself", () => {
            const result = resolveSafePath("/", "../../../");

            expect(result).toBe("/");
        });
    });
});

describe("readProjectFileSafe", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "copilot-enhance-test-"));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    describe("given an empty path", () => {
        it("returns an error", async () => {
            const result = await readProjectFileSafe(tempDir, "");

            expect(result).toEqual({ error: "Path is required" });
        });
    });

    describe("given a path traversal attempt", () => {
        it("returns an error", async () => {
            const result = await readProjectFileSafe(
                tempDir,
                "../../etc/passwd",
            );

            expect(result).toEqual({ error: "Path is outside the repository" });
        });
    });

    describe("given a non-existent file", () => {
        it("returns an error", async () => {
            const result = await readProjectFileSafe(
                tempDir,
                "nonexistent.txt",
            );

            expect(result).toEqual({ error: "File not found or unreadable" });
        });
    });

    describe("given a valid file within the repo", () => {
        it("reads and returns file content", async () => {
            const content = "hello world";
            await writeFile(join(tempDir, "test.txt"), content);

            const result = await readProjectFileSafe(tempDir, "test.txt");

            expect(result).toEqual({ content, truncated: false });
        });
    });

    describe("given a file exceeding MAX_FILE_READ_BYTES", () => {
        it("truncates content by bytes and sets truncated flag", async () => {
            const largeContent = "A".repeat(200_000);
            await writeFile(join(tempDir, "large.txt"), largeContent);

            const result = await readProjectFileSafe(tempDir, "large.txt");

            expect("content" in result && result.truncated).toBe(true);
            if ("content" in result) {
                expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(
                    102_400 + 3,
                );
            }
        });

        it("does not split multi-byte UTF-8 sequences at the boundary", async () => {
            // Build a file that forces the truncation point to land inside a
            // 3-byte character (€ = 0xE2 0x82 0xAC). Fill to 102_399 bytes
            // (1 byte short of the limit) with ASCII, then append enough €
            // characters to exceed the limit.
            const asciiPad = "A".repeat(102_399);
            const multiByteContent = `${asciiPad}${"€".repeat(100)}`;
            await writeFile(join(tempDir, "multibyte.txt"), multiByteContent);

            const result = await readProjectFileSafe(tempDir, "multibyte.txt");

            expect("content" in result && result.truncated).toBe(true);
            if ("content" in result) {
                const bytes = Buffer.byteLength(result.content, "utf-8");
                expect(bytes).toBeLessThanOrEqual(102_400);
                // Must not contain U+FFFD replacement character
                expect(result.content).not.toContain("\uFFFD");
            }
        });
    });

    describe("given a symlink pointing outside the repo root", () => {
        it("returns an error", async () => {
            const outsidePath = join(tmpdir(), "outside-target.txt");
            await writeFile(outsidePath, "secret data");
            await symlink(outsidePath, join(tempDir, "evil-link"));

            try {
                const result = await readProjectFileSafe(tempDir, "evil-link");

                expect(result).toEqual({
                    error: "Path is outside the repository",
                });
            } finally {
                await rm(outsidePath, { force: true });
            }
        });
    });

    describe("given a repoRoot with trailing slash", () => {
        it("still reads the file correctly", async () => {
            const content = "trailing slash test";
            await writeFile(join(tempDir, "test.txt"), content);

            const result = await readProjectFileSafe(`${tempDir}/`, "test.txt");

            expect(result).toEqual({ content, truncated: false });
        });
    });

    describe("given a repoRoot that is itself a symlink", () => {
        it("reads files correctly when the root is a symlinked directory", async () => {
            const realDir = await mkdtemp(
                join(tmpdir(), "copilot-enhance-real-"),
            );
            const symlinkDir = join(
                tmpdir(),
                `copilot-enhance-link-${Date.now()}`,
            );
            await writeFile(join(realDir, "test.txt"), "content via symlink");
            await symlink(realDir, symlinkDir);

            try {
                const result = await readProjectFileSafe(
                    symlinkDir,
                    "test.txt",
                );

                expect(result).toEqual({
                    content: "content via symlink",
                    truncated: false,
                });
            } finally {
                await rm(symlinkDir, { force: true });
                await rm(realDir, { recursive: true, force: true });
            }
        });
    });
});
