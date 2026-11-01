/**
 * Forces the lstat fallback path in readRegularFileNoFollow by zeroing
 * O_NOFOLLOW.
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

describe("readRegularFileNoFollow without O_NOFOLLOW", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `read-regular-fallback-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
        vi.resetModules();
    });

    describe("given a regular file", () => {
        it("should return the file content via the lstat fallback path", async () => {
            const { readRegularFileNoFollow } = await import(
                "./read-regular-file-no-follow.js"
            );
            const filePath = join(testDir, "valid.txt");
            const content = chance.paragraph();
            await writeFile(filePath, content);

            const outcome = await readRegularFileNoFollow(filePath, 1_048_576);

            expect(outcome).toEqual({ ok: true, content });
        });
    });

    describe("given a symbolic link", () => {
        it.skipIf(process.platform === "win32")(
            "should report symlink via the lstat fallback path without throwing",
            async () => {
                const { readRegularFileNoFollow } = await import(
                    "./read-regular-file-no-follow.js"
                );
                const realFile = join(testDir, "real.txt");
                const linkFile = join(testDir, "link.txt");
                await writeFile(realFile, chance.word());
                await symlink(realFile, linkFile);

                const outcome = await readRegularFileNoFollow(
                    linkFile,
                    1_048_576,
                );

                expect(outcome).toEqual({ ok: false, reason: "symlink" });
            },
        );
    });
});
