/**
 * Forces the lstat fallback path in readFileNoFollow by zeroing O_NOFOLLOW.
 */
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return {
        ...actual,
        constants: {
            ...actual.constants,
            // biome-ignore lint/style/useNamingConvention: Node fs constant name
            O_NOFOLLOW: 0,
        },
    };
});

const chance = new Chance();

describe("readFileNoFollow without O_NOFOLLOW", () => {
    let testDir: string;

    beforeEach(async () => {
        const { readFileNoFollow } = await import("./read-file-no-follow.js");
        // Keep import side-effect free; tests call through dynamic import below.
        void readFileNoFollow;
        testDir = join(
            tmpdir(),
            `read-file-nofollow-fallback-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
        vi.resetModules();
    });

    describe("given a regular file", () => {
        it("should return the file content via the lstat fallback path", async () => {
            const { readFileNoFollow } = await import(
                "./read-file-no-follow.js"
            );
            const filePath = join(testDir, "valid.txt");
            const content = chance.paragraph();
            await writeFile(filePath, content);

            const result = await readFileNoFollow(filePath, 1_048_576);

            expect(result).toBe(content);
        });
    });

    describe("given a symbolic link", () => {
        it.skipIf(process.platform === "win32")(
            "should reject with a symlink error via the lstat fallback path",
            async () => {
                const { readFileNoFollow } = await import(
                    "./read-file-no-follow.js"
                );
                const realFile = join(testDir, "real.txt");
                const linkFile = join(testDir, "link.txt");
                await writeFile(realFile, chance.word());
                await symlink(realFile, linkFile);

                await expect(
                    readFileNoFollow(linkFile, 1_048_576),
                ).rejects.toThrow("Symlinks are not allowed");
            },
        );
    });
});
