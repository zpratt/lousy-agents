import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    CLI_PROJECT_STRUCTURE,
    createFilesystemStructure,
    type FilesystemStructure,
} from "./filesystem-structure.js";

const chance = new Chance();

describe("Filesystem Structure", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("createFilesystemStructure", () => {
        it("should create directories defined in the structure", async () => {
            // Arrange
            const structure: FilesystemStructure = {
                nodes: [
                    {
                        type: "directory",
                        path: "test-dir",
                    },
                ],
            };

            // Act
            await createFilesystemStructure(structure, testDir);

            // Assert
            const dirPath = join(testDir, "test-dir");
            await expect(access(dirPath)).resolves.toBeUndefined();
        });

        it("should create files with specified content", async () => {
            // Arrange
            const fileContent = chance.paragraph();
            const structure: FilesystemStructure = {
                nodes: [
                    {
                        type: "file",
                        path: "test-file.txt",
                        content: fileContent,
                    },
                ],
            };

            // Act
            await createFilesystemStructure(structure, testDir);

            // Assert
            const filePath = join(testDir, "test-file.txt");
            await expect(access(filePath)).resolves.toBeUndefined();
            const content = await readFile(filePath, "utf-8");
            expect(content).toBe(fileContent);
        });

        it("should create nested directory structures", async () => {
            // Arrange
            const structure: FilesystemStructure = {
                nodes: [
                    {
                        type: "directory",
                        path: "parent/child/grandchild",
                    },
                ],
            };

            // Act
            await createFilesystemStructure(structure, testDir);

            // Assert
            const dirPath = join(testDir, "parent", "child", "grandchild");
            await expect(access(dirPath)).resolves.toBeUndefined();
        });

        it("should preserve existing directories", async () => {
            // Arrange
            const dirPath = join(testDir, "existing-dir");
            const existingFile = join(dirPath, "existing-file.txt");
            const existingContent = chance.paragraph();
            await mkdir(dirPath, { recursive: true });
            await writeFile(existingFile, existingContent);

            const structure: FilesystemStructure = {
                nodes: [
                    {
                        type: "directory",
                        path: "existing-dir",
                    },
                ],
            };

            // Act
            await createFilesystemStructure(structure, testDir);

            // Assert
            const content = await readFile(existingFile, "utf-8");
            expect(content).toBe(existingContent);
        });

        it("should preserve existing files", async () => {
            // Arrange
            const filePath = join(testDir, "existing-file.txt");
            const existingContent = chance.paragraph();
            await writeFile(filePath, existingContent);

            const structure: FilesystemStructure = {
                nodes: [
                    {
                        type: "file",
                        path: "existing-file.txt",
                        content: "new content",
                    },
                ],
            };

            // Act
            await createFilesystemStructure(structure, testDir);

            // Assert
            const content = await readFile(filePath, "utf-8");
            expect(content).toBe(existingContent);
        });

        it("should create multiple nodes in the correct order", async () => {
            // Arrange
            const structure: FilesystemStructure = {
                nodes: [
                    {
                        type: "directory",
                        path: "dir1",
                    },
                    {
                        type: "file",
                        path: "dir1/file1.txt",
                        content: "content1",
                    },
                    {
                        type: "directory",
                        path: "dir2",
                    },
                    {
                        type: "file",
                        path: "dir2/file2.txt",
                        content: "content2",
                    },
                ],
            };

            // Act
            await createFilesystemStructure(structure, testDir);

            // Assert
            await expect(
                access(join(testDir, "dir1")),
            ).resolves.toBeUndefined();
            await expect(
                access(join(testDir, "dir1", "file1.txt")),
            ).resolves.toBeUndefined();
            await expect(
                access(join(testDir, "dir2")),
            ).resolves.toBeUndefined();
            await expect(
                access(join(testDir, "dir2", "file2.txt")),
            ).resolves.toBeUndefined();
        });
    });

    describe("CLI_PROJECT_STRUCTURE", () => {
        it("should define .github/instructions directory", () => {
            // Assert
            const directoryNodes = CLI_PROJECT_STRUCTURE.nodes.filter(
                (node) => node.type === "directory",
            );
            expect(directoryNodes).toContainEqual({
                type: "directory",
                path: ".github/instructions",
            });
        });

        it("should define .github/copilot-instructions.md file", () => {
            // Assert
            const fileNodes = CLI_PROJECT_STRUCTURE.nodes.filter(
                (node) => node.type === "file",
            );
            expect(fileNodes).toContainEqual({
                type: "file",
                path: ".github/copilot-instructions.md",
                content: "",
            });
        });
    });
});
