import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listUncommittedPackageChanges } from "./list-uncommitted-changes.js";

const execFileAsync = promisify(execFile);

const TRACKED = "packages/a/src/tracked.ts";

// Each test builds a repository with real git commands, which a busy machine
// can take longer over than the five seconds a test gets by default.
const REPOSITORY_TEST_TIMEOUT_MILLISECONDS = 30_000;

describe("listUncommittedPackageChanges", {
    timeout: REPOSITORY_TEST_TIMEOUT_MILLISECONDS,
}, () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(await realpath(tmpdir()), "uncommitted-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    async function git(...args: string[]): Promise<void> {
        await execFileAsync(
            "git",
            [
                "-c",
                "user.name=fixture",
                "-c",
                "user.email=fixture@example.com",
                ...args,
            ],
            { cwd: root },
        );
    }

    async function write(
        path: string,
        content = "export {};\n",
    ): Promise<void> {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), content);
    }

    async function committedRepository(): Promise<void> {
        await git("init", "--quiet");
        await write(TRACKED);
        await write("README.md", "# readme\n");
        await git("add", "--all");
        await git("commit", "--quiet", "--message", "fixture");
    }

    it("should return nothing when everything is committed", async () => {
        // Arrange
        await committedRepository();

        // Act
        const paths = await listUncommittedPackageChanges(root);

        // Assert
        expect(paths).toEqual([]);
    });

    it("should list edited, staged and untracked files by path, including a file in a directory git has never seen", async () => {
        // Arrange
        await committedRepository();
        await write(TRACKED, "export const edited = 1;\n");
        await write("packages/a/src/staged.ts");
        await git("add", "packages/a/src/staged.ts");
        await write("packages/brand-new/src/deep/file.ts");

        // Act
        const paths = await listUncommittedPackageChanges(root);

        // Assert
        expect([...paths].sort()).toEqual(
            [
                "packages/a/src/staged.ts",
                TRACKED,
                "packages/brand-new/src/deep/file.ts",
            ].sort(),
        );
    });

    it("should list a deleted file", async () => {
        // Arrange
        await committedRepository();
        await rm(join(root, TRACKED));

        // Act
        const paths = await listUncommittedPackageChanges(root);

        // Assert
        expect(paths).toEqual([TRACKED]);
    });

    it("should leave out changes outside packages/", async () => {
        // Arrange
        await committedRepository();
        await write("README.md", "# changed\n");
        await write("scripts/new-script.ts");

        // Act
        const paths = await listUncommittedPackageChanges(root);

        // Assert
        expect(paths).toEqual([]);
    });

    it("should return nothing, rather than throw, when the directory is not a repository", async () => {
        // Act
        const paths = await listUncommittedPackageChanges(root);

        // Assert
        expect(paths).toEqual([]);
    });

    it("should return nothing, rather than throw, when the directory does not exist", async () => {
        // Act
        const paths = await listUncommittedPackageChanges(join(root, "absent"));

        // Assert
        expect(paths).toEqual([]);
    });
});
