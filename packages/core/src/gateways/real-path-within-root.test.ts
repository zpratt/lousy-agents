import { execFileSync } from "node:child_process";
import {
    mkdir,
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
import {
    inspectPathWithinRoot,
    resolveRealPathWithinRoot,
} from "./real-path-within-root.js";

const chance = new Chance();

describe("resolveRealPathWithinRoot", () => {
    let workDir: string;
    let rootReal: string;
    let outsideReal: string;

    beforeEach(async () => {
        workDir = join(tmpdir(), `real-path-within-root-${chance.guid()}`);
        await mkdir(join(workDir, "root"), { recursive: true });
        await mkdir(join(workDir, "outside"), { recursive: true });
        rootReal = await realpath(join(workDir, "root"));
        outsideReal = await realpath(join(workDir, "outside"));
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    describe("when the path is a regular file inside the root", () => {
        it("should return the file kind and its real path", async () => {
            const filePath = join(rootReal, `${chance.word()}.md`);
            await writeFile(filePath, chance.sentence());

            const result = await resolveRealPathWithinRoot(rootReal, filePath);

            expect(result).toEqual({ kind: "file", real: filePath });
        });
    });

    describe("when the path is a directory inside the root", () => {
        it("should return the directory kind and its real path", async () => {
            const dirPath = join(rootReal, chance.word());
            await mkdir(dirPath);

            const result = await resolveRealPathWithinRoot(rootReal, dirPath);

            expect(result).toEqual({ kind: "directory", real: dirPath });
        });
    });

    describe("when the path is a symlink to a file inside the root", () => {
        it("should return the real path of the target", async () => {
            const targetPath = join(rootReal, "target.md");
            const linkPath = join(rootReal, "link.md");
            await writeFile(targetPath, chance.sentence());
            await symlink(targetPath, linkPath);

            const result = await resolveRealPathWithinRoot(rootReal, linkPath);

            expect(result).toEqual({ kind: "file", real: targetPath });
        });
    });

    describe("when the path is a symlink to a file outside the root", () => {
        it("should return null", async () => {
            const outsidePath = join(outsideReal, "secret.md");
            const linkPath = join(rootReal, "link.md");
            await writeFile(outsidePath, chance.sentence());
            await symlink(outsidePath, linkPath);

            const result = await resolveRealPathWithinRoot(rootReal, linkPath);

            expect(result).toBeNull();
        });
    });

    describe("when the path does not exist", () => {
        it("should return null", async () => {
            const missingPath = join(rootReal, `${chance.word()}.md`);

            const result = await resolveRealPathWithinRoot(
                rootReal,
                missingPath,
            );

            expect(result).toBeNull();
        });
    });

    describe("when the path is neither a regular file nor a directory", () => {
        it("should return null", async () => {
            const fifoPath = join(rootReal, chance.word());
            execFileSync("mkfifo", [fifoPath]);

            const result = await resolveRealPathWithinRoot(rootReal, fifoPath);

            expect(result).toBeNull();
        });
    });
});

describe("inspectPathWithinRoot", () => {
    let workDir: string;
    let rootReal: string;
    let outsideReal: string;

    beforeEach(async () => {
        workDir = join(tmpdir(), `inspect-path-within-root-${chance.guid()}`);
        await mkdir(join(workDir, "root"), { recursive: true });
        await mkdir(join(workDir, "outside"), { recursive: true });
        rootReal = await realpath(join(workDir, "root"));
        outsideReal = await realpath(join(workDir, "outside"));
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it("should report the kind, real path and identity of a regular file inside the root", async () => {
        const filePath = join(rootReal, `${chance.word()}.md`);
        await writeFile(filePath, chance.sentence());
        const expected = await stat(filePath);

        const result = await inspectPathWithinRoot(rootReal, filePath);

        expect(result).toEqual({
            status: "ok",
            kind: "file",
            real: filePath,
            identity: { dev: expected.dev, ino: expected.ino },
        });
    });

    it("should report a directory inside the root", async () => {
        const dirPath = join(rootReal, chance.word());
        await mkdir(dirPath);

        const result = await inspectPathWithinRoot(rootReal, dirPath);

        expect(result).toMatchObject({
            status: "ok",
            kind: "directory",
            real: dirPath,
        });
    });

    it.skipIf(process.platform === "win32")(
        "should follow a symlink whose target stays inside the root",
        async () => {
            const target = join(rootReal, `${chance.word()}-target.md`);
            const link = join(rootReal, `${chance.word()}-link.md`);
            await writeFile(target, chance.sentence());
            await symlink(target, link);

            const result = await inspectPathWithinRoot(rootReal, link);

            expect(result).toMatchObject({
                status: "ok",
                kind: "file",
                real: target,
            });
        },
    );

    it.skipIf(process.platform === "win32")(
        "should report outside-root for a symlink whose target leaves the root",
        async () => {
            const secret = join(outsideReal, `${chance.word()}.md`);
            const link = join(rootReal, `${chance.word()}-link.md`);
            await writeFile(secret, chance.sentence());
            await symlink(secret, link);

            const result = await inspectPathWithinRoot(rootReal, link);

            expect(result).toEqual({ status: "outside-root" });
        },
    );

    it.skipIf(process.platform === "win32")(
        "should report outside-root for a symlink into a sibling directory whose name starts with the root's name",
        async () => {
            const sibling = join(workDir, "root-evil");
            await mkdir(sibling);
            const secret = join(await realpath(sibling), `${chance.word()}.md`);
            const link = join(rootReal, `${chance.word()}-link.md`);
            await writeFile(secret, chance.sentence());
            await symlink(secret, link);

            const result = await inspectPathWithinRoot(rootReal, link);

            expect(result).toEqual({ status: "outside-root" });
        },
    );

    it("should report missing for a path that goes through a regular file as if it were a directory", async () => {
        const file = join(rootReal, `${chance.word()}.md`);
        await writeFile(file, chance.sentence());

        const result = await inspectPathWithinRoot(
            rootReal,
            join(file, "child.md"),
        );

        expect(result).toEqual({ status: "missing" });
    });

    it.skipIf(process.platform === "win32")(
        "should report unsupported, not missing, for a symlink loop",
        async () => {
            const first = join(rootReal, `${chance.word()}-first`);
            const second = join(rootReal, `${chance.word()}-second`);
            await symlink(second, first);
            await symlink(first, second);

            const result = await inspectPathWithinRoot(rootReal, first);

            expect(result).toEqual({ status: "unsupported" });
        },
    );

    it("should report missing for a path that does not exist", async () => {
        const result = await inspectPathWithinRoot(
            rootReal,
            join(rootReal, `${chance.word()}.md`),
        );

        expect(result).toEqual({ status: "missing" });
    });

    it.skipIf(process.platform === "win32")(
        "should report unsupported for a path that is neither a file nor a directory",
        async () => {
            const fifo = join(rootReal, `${chance.word()}.fifo`);
            execFileSync("mkfifo", [fifo]);

            const result = await inspectPathWithinRoot(rootReal, fifo);

            expect(result).toEqual({ status: "unsupported" });
        },
    );
});
