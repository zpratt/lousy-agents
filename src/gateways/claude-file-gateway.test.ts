/**
 * Tests for Claude file gateway
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClaudeSettings } from "../entities/claude-setup.js";
import { FileSystemClaudeFileGateway } from "./claude-file-gateway.js";

const chance = new Chance();

describe("ClaudeFileGateway", () => {
    let testDir: string;
    let gateway: FileSystemClaudeFileGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-claude-gateway-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemClaudeFileGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("readSettings", () => {
        describe("when settings file exists with valid JSON", () => {
            it("should return parsed settings", async () => {
                // Arrange
                const settings: ClaudeSettings = {
                    SessionStart: ["nvm install", "npm ci"],
                    enabledPlugins: { "test@example": true },
                };
                const claudeDir = join(testDir, ".claude");
                await mkdir(claudeDir, { recursive: true });
                await writeFile(
                    join(claudeDir, "settings.json"),
                    JSON.stringify(settings, null, 2),
                    "utf-8",
                );

                // Act
                const result = await gateway.readSettings(testDir);

                // Assert
                expect(result).toEqual(settings);
            });
        });

        describe("when settings file does not exist", () => {
            it("should return null", async () => {
                // Arrange - no file created

                // Act
                const result = await gateway.readSettings(testDir);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe("when settings file contains invalid JSON", () => {
            it("should return null", async () => {
                // Arrange
                const claudeDir = join(testDir, ".claude");
                await mkdir(claudeDir, { recursive: true });
                await writeFile(
                    join(claudeDir, "settings.json"),
                    "{ invalid json }",
                    "utf-8",
                );

                // Act
                const result = await gateway.readSettings(testDir);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe("when .claude directory does not exist", () => {
            it("should return null", async () => {
                // Arrange - no .claude directory

                // Act
                const result = await gateway.readSettings(testDir);

                // Assert
                expect(result).toBeNull();
            });
        });
    });

    describe("writeSettings", () => {
        describe("when .claude directory does not exist", () => {
            it("should create directory and write settings", async () => {
                // Arrange
                const settings: ClaudeSettings = {
                    SessionStart: ["nvm install"],
                };

                // Act
                await gateway.writeSettings(testDir, settings);

                // Assert
                const settingsPath = join(testDir, ".claude", "settings.json");
                const content = await readFile(settingsPath, "utf-8");
                const parsed = JSON.parse(content);
                expect(parsed).toEqual(settings);
            });
        });

        describe("when .claude directory exists", () => {
            it("should write settings to existing directory", async () => {
                // Arrange
                const claudeDir = join(testDir, ".claude");
                await mkdir(claudeDir, { recursive: true });
                const settings: ClaudeSettings = {
                    SessionStart: ["npm ci"],
                    customProperty: "value",
                };

                // Act
                await gateway.writeSettings(testDir, settings);

                // Assert
                const content = await readFile(
                    join(claudeDir, "settings.json"),
                    "utf-8",
                );
                const parsed = JSON.parse(content);
                expect(parsed).toEqual(settings);
            });
        });

        describe("when writing settings", () => {
            it("should use 2-space indentation", async () => {
                // Arrange
                const settings: ClaudeSettings = {
                    SessionStart: ["command"],
                    nested: { key: "value" },
                };

                // Act
                await gateway.writeSettings(testDir, settings);

                // Assert
                const content = await readFile(
                    join(testDir, ".claude", "settings.json"),
                    "utf-8",
                );
                expect(content).toContain('  "SessionStart"');
                expect(content).toContain('    "command"');
            });

            it("should include trailing newline", async () => {
                // Arrange
                const settings: ClaudeSettings = {
                    SessionStart: ["command"],
                };

                // Act
                await gateway.writeSettings(testDir, settings);

                // Assert
                const content = await readFile(
                    join(testDir, ".claude", "settings.json"),
                    "utf-8",
                );
                expect(content.endsWith("\n")).toBe(true);
            });
        });
    });

    describe("readDocumentation", () => {
        describe("when CLAUDE.md exists", () => {
            it("should return file content", async () => {
                // Arrange
                const docContent = `# My Project\n\n## Environment Setup\n\nSome content`;
                await writeFile(
                    join(testDir, "CLAUDE.md"),
                    docContent,
                    "utf-8",
                );

                // Act
                const result = await gateway.readDocumentation(testDir);

                // Assert
                expect(result).toBe(docContent);
            });
        });

        describe("when CLAUDE.md does not exist", () => {
            it("should return null", async () => {
                // Arrange - no file created

                // Act
                const result = await gateway.readDocumentation(testDir);

                // Assert
                expect(result).toBeNull();
            });
        });
    });

    describe("writeDocumentation", () => {
        describe("when writing documentation", () => {
            it("should write content to CLAUDE.md", async () => {
                // Arrange
                const content = `# Project\n\n## Environment Setup\n\nContent`;

                // Act
                await gateway.writeDocumentation(testDir, content);

                // Assert
                const written = await readFile(
                    join(testDir, "CLAUDE.md"),
                    "utf-8",
                );
                expect(written).toBe(content + "\n");
            });
        });

        describe("when content has no trailing newline", () => {
            it("should add trailing newline", async () => {
                // Arrange
                const content = "# Project\n\nContent without newline";

                // Act
                await gateway.writeDocumentation(testDir, content);

                // Assert
                const written = await readFile(
                    join(testDir, "CLAUDE.md"),
                    "utf-8",
                );
                expect(written).toBe(content + "\n");
                expect(written.endsWith("\n")).toBe(true);
            });
        });

        describe("when content already has trailing newline", () => {
            it("should not add extra newline", async () => {
                // Arrange
                const content = "# Project\n\nContent with newline\n";

                // Act
                await gateway.writeDocumentation(testDir, content);

                // Assert
                const written = await readFile(
                    join(testDir, "CLAUDE.md"),
                    "utf-8",
                );
                expect(written).toBe(content);
                // Count actual newlines: one after "# Project", one after blank line, one at end
                const newlineCount = (written.match(/\n/g) || []).length;
                expect(newlineCount).toBe(3);
            });
        });

        describe("when overwriting existing file", () => {
            it("should replace content", async () => {
                // Arrange
                await writeFile(
                    join(testDir, "CLAUDE.md"),
                    "Old content",
                    "utf-8",
                );
                const newContent = "# New Content";

                // Act
                await gateway.writeDocumentation(testDir, newContent);

                // Assert
                const written = await readFile(
                    join(testDir, "CLAUDE.md"),
                    "utf-8",
                );
                expect(written).toBe(newContent + "\n");
                expect(written).not.toContain("Old content");
            });
        });
    });
});
