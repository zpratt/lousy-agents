import { constants } from "node:fs";
import { lstat, mkdir, open, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    type NoFollowFsPort,
    readRegularFileNoFollow,
} from "./read-regular-file-no-follow.js";

const chance = new Chance();

const CAP_BYTES = 1_048_576;
const NON_BLOCKING = constants.O_NONBLOCK ?? 0;

function followingFsPort(
    kernelNoFollow: boolean,
    openedWith: number[] = [],
): NoFollowFsPort {
    return {
        kernelNoFollow,
        open: (path, flags) => {
            openedWith.push(flags);
            return open(path, constants.O_RDONLY);
        },
        lstat: (path) => lstat(path),
    };
}

describe("readRegularFileNoFollow on a file system without kernel O_NOFOLLOW", () => {
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
    });

    describe("given a regular file", () => {
        it("should return the file content", async () => {
            const filePath = join(testDir, "valid.txt");
            const content = chance.paragraph();
            await writeFile(filePath, content);

            const outcome = await readRegularFileNoFollow(filePath, CAP_BYTES, {
                fs: followingFsPort(false),
            });

            expect(outcome).toEqual({ ok: true, content });
        });

        it("should open it without the no-follow flag, which the platform does not have", async () => {
            const filePath = join(testDir, "valid.txt");
            await writeFile(filePath, chance.word());
            const openedWith: number[] = [];

            await readRegularFileNoFollow(filePath, CAP_BYTES, {
                fs: followingFsPort(false, openedWith),
            });

            expect(openedWith).toEqual([constants.O_RDONLY | NON_BLOCKING]);
        });
    });

    describe("given a symbolic link", () => {
        it.skipIf(process.platform === "win32")(
            "should report symlink from lstat before opening anything, even though open would follow it",
            async () => {
                const realFile = join(testDir, "real.txt");
                const linkFile = join(testDir, "link.txt");
                await writeFile(realFile, chance.word());
                await symlink(realFile, linkFile);
                const openedWith: number[] = [];

                const outcome = await readRegularFileNoFollow(
                    linkFile,
                    CAP_BYTES,
                    { fs: followingFsPort(false, openedWith) },
                );

                expect(outcome).toEqual({ ok: false, reason: "symlink" });
                expect(openedWith).toEqual([]);
            },
        );
    });
});

describe("readRegularFileNoFollow on a file system with kernel O_NOFOLLOW", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `read-regular-kernel-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it.skipIf(typeof constants.O_NOFOLLOW !== "number")(
        "should ask the kernel to refuse a symlink by opening with the no-follow flag",
        async () => {
            const filePath = join(testDir, "valid.txt");
            await writeFile(filePath, chance.word());
            const openedWith: number[] = [];

            await readRegularFileNoFollow(filePath, CAP_BYTES, {
                fs: followingFsPort(true, openedWith),
            });

            expect(openedWith).toEqual([
                constants.O_RDONLY | constants.O_NOFOLLOW | NON_BLOCKING,
            ]);
        },
    );
});
