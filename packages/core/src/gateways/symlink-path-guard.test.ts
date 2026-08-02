import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    rejectSymlinkSegments,
    symlinkNotAllowedError,
} from "./symlink-path-guard.js";

const chance = new Chance();

describe("rejectSymlinkSegments", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `symlink-path-guard-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when relativeFromRoot is empty", () => {
        it("should resolve without calling onSymlink", async () => {
            let called = false;

            await rejectSymlinkSegments(testDir, "", () => {
                called = true;
                return new Error("unexpected");
            });

            expect(called).toBe(false);
        });
    });

    describe("when relativeFromRoot is a single dot", () => {
        it("should resolve without treating the root as a path segment", async () => {
            let called = false;

            await rejectSymlinkSegments(testDir, ".", () => {
                called = true;
                return new Error("unexpected");
            });

            expect(called).toBe(false);
        });
    });

    describe("when a path segment is a symbolic link", () => {
        it.skipIf(process.platform === "win32")(
            "should throw the error from onSymlink",
            async () => {
                const realFile = join(testDir, "real.txt");
                await writeFile(realFile, chance.word());
                await symlink(realFile, join(testDir, "link.txt"));

                await expect(
                    rejectSymlinkSegments(testDir, "link.txt", (segmentPath) =>
                        symlinkNotAllowedError(segmentPath),
                    ),
                ).rejects.toThrow(/symlinks are not allowed/i);
            },
        );
    });

    describe("symlinkNotAllowedError", () => {
        it("should not embed raw control characters in the message", () => {
            const unsafeRelative = "link-\x1b[2J.txt";
            const message = symlinkNotAllowedError(unsafeRelative).message;

            expect(message).toMatch(/Symlinks are not allowed/i);
            expect(message).not.toContain("\x1b");
            expect(message).toContain(JSON.stringify(unsafeRelative));
        });
    });

    describe("when intermediate segments are regular directories", () => {
        it("should resolve for a nested regular file", async () => {
            await mkdir(join(testDir, "nested"), { recursive: true });
            await writeFile(join(testDir, "nested", "file.txt"), chance.word());

            await expect(
                rejectSymlinkSegments(
                    testDir,
                    join("nested", "file.txt"),
                    () => new Error("unexpected"),
                ),
            ).resolves.toBeUndefined();
        });
    });
});
