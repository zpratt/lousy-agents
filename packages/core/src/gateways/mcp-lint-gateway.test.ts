import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemMcpServersLintGateway } from "./mcp-lint-gateway.js";

const chance = new Chance();

describe("FileSystemMcpServersLintGateway", () => {
    let testDir: string;
    let gateway: FileSystemMcpServersLintGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-mcp-lint-gw-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemMcpServersLintGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("discoverMcpConfigFiles", () => {
        describe("when no MCP config sources exist", () => {
            it("should return an empty array", async () => {
                // Act
                const files = await gateway.discoverMcpConfigFiles(testDir);

                // Assert
                expect(files).toEqual([]);
            });
        });

        describe("when .mcp.json exists at the repo root", () => {
            it("should discover it", async () => {
                // Arrange
                await writeFile(
                    join(testDir, ".mcp.json"),
                    JSON.stringify({ mcpServers: {} }),
                );

                // Act
                const files = await gateway.discoverMcpConfigFiles(testDir);

                // Assert
                expect(files).toHaveLength(1);
                expect(files[0].relativePath).toBe(".mcp.json");
            });
        });

        describe("when .vscode/mcp.json exists", () => {
            it("should discover it", async () => {
                // Arrange
                const vscodeDir = join(testDir, ".vscode");
                await mkdir(vscodeDir, { recursive: true });
                await writeFile(
                    join(vscodeDir, "mcp.json"),
                    JSON.stringify({ mcpServers: {} }),
                );

                // Act
                const files = await gateway.discoverMcpConfigFiles(testDir);

                // Assert
                expect(files).toHaveLength(1);
                expect(files[0].relativePath).toBe(join(".vscode", "mcp.json"));
            });
        });

        describe("when both .mcp.json and .vscode/mcp.json exist", () => {
            it("should discover both", async () => {
                // Arrange
                await writeFile(
                    join(testDir, ".mcp.json"),
                    JSON.stringify({ mcpServers: {} }),
                );
                const vscodeDir = join(testDir, ".vscode");
                await mkdir(vscodeDir, { recursive: true });
                await writeFile(
                    join(vscodeDir, "mcp.json"),
                    JSON.stringify({ mcpServers: {} }),
                );

                // Act
                const files = await gateway.discoverMcpConfigFiles(testDir);

                // Assert
                expect(files).toHaveLength(2);
            });
        });

        describe("given a symlinked .mcp.json", () => {
            it.skipIf(process.platform === "win32")(
                "should skip the symlinked file",
                async () => {
                    // Arrange
                    const realFile = join(testDir, "real-mcp.json");
                    await writeFile(
                        realFile,
                        JSON.stringify({ mcpServers: {} }),
                    );
                    await symlink(realFile, join(testDir, ".mcp.json"));

                    // Act
                    const files = await gateway.discoverMcpConfigFiles(testDir);

                    // Assert
                    expect(files).toEqual([]);
                },
            );
        });
    });

    describe("readFileContent", () => {
        it("should read file content as UTF-8", async () => {
            // Arrange
            const expectedContent = JSON.stringify({ mcpServers: {} });
            const filePath = join(testDir, ".mcp.json");
            await writeFile(filePath, expectedContent);

            // Act
            const content = await gateway.readFileContent(filePath);

            // Assert
            expect(content).toBe(expectedContent);
        });

        describe("given a file exceeding the size limit", () => {
            it("should reject with a size limit error", async () => {
                // Arrange — write a file just over 1 MB
                const filePath = join(testDir, ".mcp.json");
                const oversizeContent = "x".repeat(1_048_576 + 1);
                await writeFile(filePath, oversizeContent);

                // Act & Assert
                await expect(gateway.readFileContent(filePath)).rejects.toThrow(
                    "exceeds size limit",
                );
            });
        });
    });
});
