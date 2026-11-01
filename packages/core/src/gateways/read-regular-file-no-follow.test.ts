import { link, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    type NoFollowFileHandle,
    type NoFollowFsPort,
    type NoFollowStats,
    readRegularFileNoFollow,
} from "./read-regular-file-no-follow.js";

const chance = new Chance();

const CAP_BYTES = 16;

function regularStats(overrides: Partial<NoFollowStats> = {}): NoFollowStats {
    return {
        dev: 1,
        ino: 1,
        size: 0,
        nlink: 1,
        isFile: () => true,
        isSymbolicLink: () => false,
        ...overrides,
    };
}

function fakeHandle(
    stats: NoFollowStats,
    read: NoFollowFileHandle["read"],
): NoFollowFileHandle & { close: ReturnType<typeof vi.fn> } {
    return {
        stat: async () => stats,
        read,
        close: vi.fn(async () => undefined),
    };
}

describe("readRegularFileNoFollow", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `read-regular-no-follow-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("given a regular file", () => {
        it("should return the content when it is within the cap", async () => {
            // Arrange
            const filePath = join(testDir, "within.md");
            const content = chance.string({ length: CAP_BYTES - 1 });
            await writeFile(filePath, content);

            // Act
            const outcome = await readRegularFileNoFollow(filePath, CAP_BYTES);

            // Assert
            expect(outcome).toEqual({ ok: true, content });
        });

        it("should return the content when it is exactly the cap", async () => {
            // Arrange
            const filePath = join(testDir, "exact.md");
            const content = "a".repeat(CAP_BYTES);
            await writeFile(filePath, content);

            // Act
            const outcome = await readRegularFileNoFollow(filePath, CAP_BYTES);

            // Assert
            expect(outcome).toEqual({ ok: true, content });
        });

        it("should report too-large when it is one byte over the cap", async () => {
            // Arrange
            const filePath = join(testDir, "over.md");
            await writeFile(filePath, "a".repeat(CAP_BYTES + 1));

            // Act
            const outcome = await readRegularFileNoFollow(filePath, CAP_BYTES);

            // Assert
            expect(outcome).toEqual({ ok: false, reason: "too-large" });
        });
    });

    describe("given a path that is not a plain regular file", () => {
        it.skipIf(process.platform === "win32")(
            "should report symlink instead of reading through it",
            async () => {
                // Arrange
                const realFile = join(testDir, "real.md");
                const linkFile = join(testDir, "link.md");
                await writeFile(realFile, "secret");
                await symlink(realFile, linkFile);

                // Act
                const outcome = await readRegularFileNoFollow(
                    linkFile,
                    CAP_BYTES,
                );

                // Assert
                expect(outcome).toEqual({ ok: false, reason: "symlink" });
            },
        );

        it("should report not-regular for a directory", async () => {
            // Arrange
            const directory = join(testDir, "dir.md");
            await mkdir(directory);

            // Act
            const outcome = await readRegularFileNoFollow(directory, CAP_BYTES);

            // Assert
            expect(outcome).toEqual({ ok: false, reason: "not-regular" });
        });

        it.skipIf(process.platform === "win32")(
            "should report not-regular for a file with more than one hard link",
            async () => {
                // Arrange
                const original = join(testDir, "original.md");
                await writeFile(original, "shared");
                await link(original, join(testDir, "alias.md"));

                // Act
                const outcome = await readRegularFileNoFollow(
                    original,
                    CAP_BYTES,
                );

                // Assert
                expect(outcome).toEqual({ ok: false, reason: "not-regular" });
            },
        );

        it("should report unreadable instead of throwing for a missing path", async () => {
            // Arrange
            const missing = join(testDir, `${chance.word()}.md`);

            // Act
            const outcome = await readRegularFileNoFollow(missing, CAP_BYTES);

            // Assert
            expect(outcome).toEqual({ ok: false, reason: "unreadable" });
        });
    });

    describe("given an injected file system", () => {
        it("should report symlink, not throw, when the kernel answers ELOOP", async () => {
            // Arrange
            const fs: NoFollowFsPort = {
                open: async () => {
                    throw Object.assign(new Error("too many links"), {
                        code: "ELOOP",
                    });
                },
                lstat: async () => regularStats(),
            };

            // Act
            const outcome = await readRegularFileNoFollow(
                "/x/y.md",
                CAP_BYTES,
                {
                    fs,
                },
            );

            // Assert
            expect(outcome).toEqual({ ok: false, reason: "symlink" });
        });

        it("should read at most cap+1 bytes even when the file keeps growing after fstat", async () => {
            // Arrange
            let totalBytesRead = 0;
            const handle = fakeHandle(
                regularStats({ size: 3 }),
                async (buffer, _offset, length) => {
                    buffer.fill(97, 0, length);
                    totalBytesRead += length;
                    return { bytesRead: length };
                },
            );
            const fs: NoFollowFsPort = {
                open: async () => handle,
                lstat: async () => regularStats({ size: 3 }),
            };

            // Act
            const outcome = await readRegularFileNoFollow(
                "/x/y.md",
                CAP_BYTES,
                {
                    fs,
                },
            );

            // Assert
            expect(outcome).toEqual({ ok: false, reason: "too-large" });
            expect(totalBytesRead).toBe(CAP_BYTES + 1);
            expect(handle.close).toHaveBeenCalledTimes(1);
        });

        it("should reject the read when the opened file is not the file now at the path", async () => {
            // Arrange: the path was swapped after it was checked
            const read = vi.fn(async () => ({ bytesRead: 0 }));
            const handle = fakeHandle(regularStats({ ino: 2 }), read);
            const fs: NoFollowFsPort = {
                open: async () => handle,
                lstat: async () => regularStats({ ino: 1 }),
            };

            // Act
            const outcome = await readRegularFileNoFollow(
                "/x/y.md",
                CAP_BYTES,
                {
                    fs,
                },
            );

            // Assert
            expect(outcome).toEqual({ ok: false, reason: "identity-mismatch" });
            expect(read).not.toHaveBeenCalled();
            expect(handle.close).toHaveBeenCalledTimes(1);
        });

        it("should reject the read when the opened file differs from the identity recorded at check time", async () => {
            // Arrange: file swapped between the check and the open
            const read = vi.fn(async () => ({ bytesRead: 0 }));
            const swapped = regularStats({ dev: 1, ino: 2 });
            const handle = fakeHandle(swapped, read);
            const fs: NoFollowFsPort = {
                open: async () => handle,
                lstat: async () => swapped,
            };

            // Act
            const outcome = await readRegularFileNoFollow(
                "/x/y.md",
                CAP_BYTES,
                {
                    fs,
                    expectedIdentity: { dev: 1, ino: 1 },
                },
            );

            // Assert
            expect(outcome).toEqual({ ok: false, reason: "identity-mismatch" });
            expect(read).not.toHaveBeenCalled();
        });

        it("should reject a path that is a symlink by the time it is re-checked", async () => {
            // Arrange: lstat now reports a non-regular entry at the path
            const read = vi.fn(async () => ({ bytesRead: 0 }));
            const handle = fakeHandle(regularStats(), read);
            const fs: NoFollowFsPort = {
                open: async () => handle,
                lstat: async () => regularStats({ isFile: () => false }),
            };

            // Act
            const outcome = await readRegularFileNoFollow(
                "/x/y.md",
                CAP_BYTES,
                {
                    fs,
                },
            );

            // Assert
            expect(outcome).toEqual({ ok: false, reason: "identity-mismatch" });
            expect(read).not.toHaveBeenCalled();
        });

        it("should close the handle after a successful read", async () => {
            // Arrange
            const content = chance.word();
            let served = false;
            const handle = fakeHandle(
                regularStats({ size: content.length }),
                async (buffer, _offset, length) => {
                    if (served) {
                        return { bytesRead: 0 };
                    }
                    served = true;
                    const bytes = Buffer.from(content);
                    bytes.copy(buffer, 0, 0, Math.min(length, bytes.length));
                    return { bytesRead: Math.min(length, bytes.length) };
                },
            );
            const fs: NoFollowFsPort = {
                open: async () => handle,
                lstat: async () => regularStats({ size: content.length }),
            };

            // Act
            const outcome = await readRegularFileNoFollow(
                "/x/y.md",
                CAP_BYTES,
                {
                    fs,
                },
            );

            // Assert
            expect(outcome).toEqual({ ok: true, content });
            expect(handle.close).toHaveBeenCalledTimes(1);
        });
    });
});
