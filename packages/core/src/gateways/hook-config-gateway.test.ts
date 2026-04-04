// biome-ignore-all lint/style/useNamingConvention: Claude Code API uses PascalCase hook event names (PreToolUse)
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemHookConfigGateway } from "./hook-config-gateway.js";

const chance = new Chance();

describe("FileSystemHookConfigGateway", () => {
    let testDir: string;
    let gateway: FileSystemHookConfigGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-hook-gw-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemHookConfigGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("discoverHookFiles", () => {
        describe("given a copilot hooks.json with preToolUse", () => {
            it("should discover the file as copilot platform", async () => {
                // Arrange
                const hooksDir = join(
                    testDir,
                    ".github",
                    "hooks",
                    "agent-shell",
                );
                await mkdir(hooksDir, { recursive: true });
                await writeFile(
                    join(hooksDir, "hooks.json"),
                    JSON.stringify({
                        version: 1,
                        hooks: {
                            preToolUse: [
                                { type: "command", bash: "./check.sh" },
                            ],
                        },
                    }),
                );

                // Act
                const result = await gateway.discoverHookFiles(testDir);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0]?.platform).toBe("copilot");
                expect(result[0]?.filePath).toContain("hooks.json");
            });
        });

        describe("given a claude settings.json with PreToolUse", () => {
            it("should discover the file as claude platform", async () => {
                // Arrange
                const claudeDir = join(testDir, ".claude");
                await mkdir(claudeDir, { recursive: true });
                await writeFile(
                    join(claudeDir, "settings.json"),
                    JSON.stringify({
                        hooks: {
                            PreToolUse: [
                                {
                                    hooks: [
                                        {
                                            type: "command",
                                            command: "./check.sh",
                                        },
                                    ],
                                },
                            ],
                        },
                    }),
                );

                // Act
                const result = await gateway.discoverHookFiles(testDir);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0]?.platform).toBe("claude");
            });
        });

        describe("given a directory with no hook files", () => {
            it("should return an empty array", async () => {
                // Act
                const result = await gateway.discoverHookFiles(testDir);

                // Assert
                expect(result).toEqual([]);
            });
        });

        describe("given a copilot hooks.json without preToolUse key", () => {
            it("should not discover the file", async () => {
                // Arrange
                const hooksDir = join(
                    testDir,
                    ".github",
                    "hooks",
                    "agent-shell",
                );
                await mkdir(hooksDir, { recursive: true });
                await writeFile(
                    join(hooksDir, "hooks.json"),
                    JSON.stringify({ version: 1, hooks: {} }),
                );

                // Act
                const result = await gateway.discoverHookFiles(testDir);

                // Assert
                expect(result).toEqual([]);
            });
        });

        describe("given a copilot hooks.json with invalid JSON containing preToolUse", () => {
            it("should still discover the file so use case can report the error", async () => {
                // Arrange
                const hooksDir = join(
                    testDir,
                    ".github",
                    "hooks",
                    "agent-shell",
                );
                await mkdir(hooksDir, { recursive: true });
                await writeFile(
                    join(hooksDir, "hooks.json"),
                    '{ "hooks": { "preToolUse": INVALID }',
                );

                // Act
                const result = await gateway.discoverHookFiles(testDir);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0]?.platform).toBe("copilot");
            });
        });

        describe("given a copilot hooks.json where preToolUse appears only in a string value", () => {
            it("should not discover the file", async () => {
                // Arrange
                const hooksDir = join(
                    testDir,
                    ".github",
                    "hooks",
                    "agent-shell",
                );
                await mkdir(hooksDir, { recursive: true });
                await writeFile(
                    join(hooksDir, "hooks.json"),
                    JSON.stringify({
                        version: 1,
                        hooks: {
                            sessionStart: [
                                { type: "command", bash: "echo preToolUse" },
                            ],
                        },
                    }),
                );

                // Act
                const result = await gateway.discoverHookFiles(testDir);

                // Assert
                expect(result).toEqual([]);
            });
        });

        describe("given a claude settings.json without hooks section", () => {
            it("should not discover the file", async () => {
                // Arrange
                const claudeDir = join(testDir, ".claude");
                await mkdir(claudeDir, { recursive: true });
                await writeFile(
                    join(claudeDir, "settings.json"),
                    JSON.stringify({ permissions: { allow: ["Read"] } }),
                );

                // Act
                const result = await gateway.discoverHookFiles(testDir);

                // Assert
                expect(result).toEqual([]);
            });
        });
        describe("given a symbolic link at a known hook path", () => {
            it("should not discover the symlinked file", async () => {
                // Arrange
                const hooksDir = join(
                    testDir,
                    ".github",
                    "hooks",
                    "agent-shell",
                );
                await mkdir(hooksDir, { recursive: true });
                const realFile = join(testDir, "real-hooks.json");
                await writeFile(
                    realFile,
                    JSON.stringify({
                        version: 1,
                        hooks: {
                            preToolUse: [
                                { type: "command", bash: "./check.sh" },
                            ],
                        },
                    }),
                );
                await symlink(realFile, join(hooksDir, "hooks.json"));

                // Act
                const result = await gateway.discoverHookFiles(testDir);

                // Assert
                expect(result).toEqual([]);
            });
        });
    });

    describe("readFileContent", () => {
        describe("given a regular file", () => {
            it("should return the file content", async () => {
                // Arrange
                const filePath = join(testDir, "test.json");
                const content = '{"hooks": {}}';
                await writeFile(filePath, content);

                // Act
                const result = await gateway.readFileContent(filePath);

                // Assert
                expect(result).toBe(content);
            });
        });

        describe("given a symbolic link", () => {
            it("should reject with an error", async () => {
                // Arrange
                const realFile = join(testDir, "real.json");
                const linkFile = join(testDir, "link.json");
                await writeFile(realFile, "{}");
                await symlink(realFile, linkFile);

                // Act & Assert
                await expect(gateway.readFileContent(linkFile)).rejects.toThrow(
                    "Symlinks are not allowed",
                );
            });
        });

        describe("given a file exceeding the size limit", () => {
            it("should reject with a size limit error", async () => {
                // Arrange
                const filePath = join(testDir, "large.json");
                // Write a file just over the 1 MB limit
                const overLimit = Buffer.alloc(1_048_577, "x");
                await writeFile(filePath, overLimit);

                // Act & Assert
                await expect(
                    gateway.readFileContent(filePath),
                ).rejects.toThrow();
            });
        });
    });
});
