import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverMarkdownFiles } from "./markdown-file-discovery.js";

const chance = new Chance();

const deriveNameFromStem = (filename: string) => basename(filename, ".md");

describe("discoverMarkdownFiles", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-md-discovery-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when the root directory does not exist", () => {
        it("should return an empty array", async () => {
            // Act
            const files = await discoverMarkdownFiles(
                testDir,
                "does-not-exist",
                deriveNameFromStem,
            );

            // Assert
            expect(files).toEqual([]);
        });
    });

    describe("when the root directory contains markdown files", () => {
        it("should discover files with names derived by the callback", async () => {
            // Arrange
            const rootDir = join(testDir, "agents");
            await mkdir(rootDir, { recursive: true });
            await writeFile(join(rootDir, "reviewer.md"), "content");
            await writeFile(join(rootDir, "planner.md"), "content");

            // Act
            const files = await discoverMarkdownFiles(
                testDir,
                "agents",
                deriveNameFromStem,
            );

            // Assert
            expect(files).toHaveLength(2);
            expect(files.map((f) => f.name).sort()).toEqual([
                "planner",
                "reviewer",
            ]);
        });
    });

    describe("when the root directory contains subdirectories with markdown files", () => {
        it("should discover files in nested directories", async () => {
            // Arrange
            const rootDir = join(testDir, "agents");
            const nestedDir = join(rootDir, "team");
            await mkdir(nestedDir, { recursive: true });
            await writeFile(join(rootDir, "reviewer.md"), "content");
            await writeFile(join(nestedDir, "planner.md"), "content");

            // Act
            const files = await discoverMarkdownFiles(
                testDir,
                "agents",
                deriveNameFromStem,
            );

            // Assert
            expect(files).toHaveLength(2);
            expect(files.map((f) => f.name).sort()).toEqual([
                "planner",
                "reviewer",
            ]);
        });
    });

    describe("when the root directory contains non-markdown files", () => {
        it("should skip non-markdown files", async () => {
            // Arrange
            const rootDir = join(testDir, "agents");
            await mkdir(rootDir, { recursive: true });
            await writeFile(join(rootDir, "reviewer.md"), "content");
            await writeFile(join(rootDir, "config.json"), "{}");

            // Act
            const files = await discoverMarkdownFiles(
                testDir,
                "agents",
                deriveNameFromStem,
            );

            // Assert
            expect(files).toHaveLength(1);
            expect(files[0].name).toBe("reviewer");
        });
    });

    describe("when a subdirectory is a symbolic link", () => {
        it.skipIf(process.platform === "win32")(
            "should skip the symlinked subdirectory",
            async () => {
                // Arrange
                const rootDir = join(testDir, "agents");
                const realDir = join(testDir, "real-dir");
                await mkdir(rootDir, { recursive: true });
                await mkdir(realDir, { recursive: true });
                await writeFile(join(realDir, "hidden.md"), "content");
                await symlink(realDir, join(rootDir, "linked"));

                // Act
                const files = await discoverMarkdownFiles(
                    testDir,
                    "agents",
                    deriveNameFromStem,
                );

                // Assert
                expect(files).toEqual([]);
            },
        );
    });

    describe("when directory nesting exceeds the depth cap", () => {
        it("should stop descending instead of exhausting the call stack", async () => {
            // Arrange — nest past MAX_WALK_DEPTH (32) with short segment
            // names so the path stays under OS name-length limits.
            const rootDir = join(testDir, "agents");
            let currentDir = rootDir;
            await mkdir(currentDir, { recursive: true });
            const depth = 40;
            for (let i = 0; i < depth; i++) {
                currentDir = join(currentDir, "d");
                await mkdir(currentDir, { recursive: true });
            }
            await writeFile(join(currentDir, "buried.md"), "content");

            // Act & Assert
            await expect(
                discoverMarkdownFiles(testDir, "agents", deriveNameFromStem),
            ).resolves.toEqual([]);
        });
    });
});
