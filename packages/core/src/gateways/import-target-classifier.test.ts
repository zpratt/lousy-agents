import {
    chmod,
    link,
    mkdir,
    mkdtemp,
    realpath,
    rm,
    stat,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyImportTarget } from "./import-target-classifier.js";
import type {
    NoFollowFileHandle,
    NoFollowFsPort,
    NoFollowStats,
} from "./read-regular-file-no-follow.js";
import type { InspectionFsPort } from "./real-path-within-root.js";

const chance = new Chance();
const CAP_BYTES = 64;

describe("classifyImportTarget", () => {
    let workDir: string;
    let rootReal: string;
    let outsideReal: string;

    beforeEach(async () => {
        workDir = await realpath(
            await mkdtemp(join(tmpdir(), "import-target-classifier-")),
        );
        rootReal = join(workDir, "root");
        outsideReal = join(workDir, "outside");
        await mkdir(rootReal);
        await mkdir(outsideReal);
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    describe("when the target is a regular file inside the root", () => {
        it("should report it usable with its real path relative to the root", async () => {
            await writeFile(join(rootReal, "a.md"), chance.word());

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "a.md"),
                CAP_BYTES,
            );

            expect(result).toEqual({ ok: true, real: "a.md" });
        });

        it("should follow a symlink that stays inside the root to the real file", async () => {
            await mkdir(join(rootReal, "docs"));
            await writeFile(join(rootReal, "docs", "real.md"), chance.word());
            await symlink("docs/real.md", join(rootReal, "alias.md"));

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "alias.md"),
                CAP_BYTES,
            );

            expect(result).toEqual({ ok: true, real: "docs/real.md" });
        });

        it("should accept a file exactly at the size cap", async () => {
            await writeFile(join(rootReal, "edge.md"), "a".repeat(CAP_BYTES));

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "edge.md"),
                CAP_BYTES,
            );

            expect(result).toEqual({ ok: true, real: "edge.md" });
        });
    });

    describe("when the target cannot be used", () => {
        it("should report a path that does not exist as unresolved", async () => {
            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "missing.md"),
                CAP_BYTES,
            );

            expect(result).toEqual({ ok: false, status: "unresolved" });
        });

        it("should report a symlink to a file outside the root as a symlink", async () => {
            await writeFile(join(outsideReal, "secret.md"), chance.word());
            await symlink(
                join(outsideReal, "secret.md"),
                join(rootReal, "link.md"),
            );

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "link.md"),
                CAP_BYTES,
            );

            expect(result).toEqual({ ok: false, status: "symlink" });
        });

        it("should report a directory as not a regular file", async () => {
            await mkdir(join(rootReal, "docs"));

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "docs"),
                CAP_BYTES,
            );

            expect(result).toEqual({ ok: false, status: "not-regular" });
        });

        it("should report a file with more than one hard link as hard-linked", async () => {
            await writeFile(join(rootReal, "one.md"), chance.word());
            await link(join(rootReal, "one.md"), join(rootReal, "two.md"));

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "one.md"),
                CAP_BYTES,
            );

            expect(result).toEqual({ ok: false, status: "hard-linked" });
        });

        it("should report a file one byte over the cap as size-exceeded", async () => {
            await writeFile(
                join(rootReal, "big.md"),
                "a".repeat(CAP_BYTES + 1),
            );

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "big.md"),
                CAP_BYTES,
            );

            expect(result).toEqual({ ok: false, status: "size-exceeded" });
        });
    });

    describe("when the file at the path is not the file that was inspected", () => {
        function statsOf(dev: number, ino: number): NoFollowStats {
            return {
                dev,
                ino,
                size: 1,
                nlink: 1,
                isFile: () => true,
                isSymbolicLink: () => false,
            };
        }

        function swappedFs(): NoFollowFsPort {
            const swapped = statsOf(7, 7);
            const handle: NoFollowFileHandle = {
                stat: async () => swapped,
                read: async () => ({ bytesRead: 0 }),
                close: async () => undefined,
            };
            return { open: async () => handle, lstat: async () => swapped };
        }

        it("should report it as unreadable instead of trusting the earlier inspection", async () => {
            await writeFile(join(rootReal, "a.md"), chance.word());

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "a.md"),
                CAP_BYTES,
                { fs: swappedFs() },
            );

            expect(result).toEqual({ ok: false, status: "unreadable" });
        });
    });

    describe("when the file system refuses to open the target", () => {
        function refusingFs(code: string): NoFollowFsPort {
            return {
                open: async () => {
                    throw Object.assign(new Error(code), { code });
                },
                lstat: async () => {
                    throw Object.assign(new Error(code), { code });
                },
            };
        }

        it.each(["EMFILE", "ENFILE", "EACCES"])(
            "should report an open that fails with %s as unreadable, never as missing",
            async (code) => {
                await writeFile(join(rootReal, "a.md"), chance.word());

                const result = await classifyImportTarget(
                    rootReal,
                    join(rootReal, "a.md"),
                    CAP_BYTES,
                    { fs: refusingFs(code) },
                );

                expect(result).toEqual({ ok: false, status: "unreadable" });
            },
        );

        it("should still report a target that does not exist as unresolved", async () => {
            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "nothing.md"),
                CAP_BYTES,
                { fs: refusingFs("EMFILE") },
            );

            expect(result).toEqual({ ok: false, status: "unresolved" });
        });
    });

    describe("when the process may not look through a directory on the way to the target", () => {
        const cannotDenyAccess =
            process.platform === "win32" || process.getuid?.() === 0;

        it.skipIf(cannotDenyAccess)(
            "should report it as unreadable, because nothing is known about whether it exists",
            async () => {
                const closed = join(rootReal, "closed");
                await mkdir(closed);
                await writeFile(join(closed, "a.md"), chance.word());
                await chmod(closed, 0o000);

                try {
                    const result = await classifyImportTarget(
                        rootReal,
                        join(closed, "a.md"),
                        CAP_BYTES,
                    );

                    expect(result).toEqual({
                        ok: false,
                        status: "unreadable",
                    });
                } finally {
                    await chmod(closed, 0o700);
                }
            },
        );
    });

    describe("when it is given the file system calls to inspect the path with", () => {
        function inspectionFailing(code: string): InspectionFsPort {
            const failure = Object.assign(new Error(code), { code });
            return {
                realpath: async () => {
                    throw failure;
                },
                stat,
            };
        }

        it("should look at the target through the port it was given", async () => {
            await writeFile(join(rootReal, "a.md"), chance.word());
            const looked: string[] = [];
            const inspectionFs: InspectionFsPort = {
                realpath: async (path) => {
                    looked.push(`realpath ${path}`);
                    return realpath(path);
                },
                stat: async (path) => {
                    looked.push(`stat ${path}`);
                    return stat(path);
                },
            };

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "a.md"),
                CAP_BYTES,
                { inspectionFs },
            );

            expect(result).toEqual({ ok: true, real: "a.md" });
            expect(looked).toEqual([
                `realpath ${join(rootReal, "a.md")}`,
                `stat ${join(rootReal, "a.md")}`,
            ]);
        });

        it("should report a failure of the port to resolve the path as unreadable when the code means the system refused", async () => {
            await writeFile(join(rootReal, "a.md"), chance.word());

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "a.md"),
                CAP_BYTES,
                { inspectionFs: inspectionFailing("EMFILE") },
            );

            expect(result).toEqual({ ok: false, status: "unreadable" });
        });

        it("should report a name too long for the file system as unresolved", async () => {
            await writeFile(join(rootReal, "a.md"), chance.word());

            const result = await classifyImportTarget(
                rootReal,
                join(rootReal, "a.md"),
                CAP_BYTES,
                { inspectionFs: inspectionFailing("ENAMETOOLONG") },
            );

            expect(result).toEqual({ ok: false, status: "unresolved" });
        });
    });
});
