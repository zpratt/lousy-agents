import { execFileSync } from "node:child_process";
import { mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveRealPathWithinRoot } from "./real-path-within-root.js";

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
