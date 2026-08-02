import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { DiscoveredMcpConfigFile } from "../entities/mcp-server.js";
import {
    LintMcpServersUseCase,
    type McpServersLintGateway,
} from "./lint-mcp-servers.js";

const chance = new Chance();

function createMockGateway(
    overrides: Partial<McpServersLintGateway> = {},
): McpServersLintGateway {
    return {
        discoverMcpConfigFiles: vi.fn().mockResolvedValue([]),
        readFileContent: vi.fn().mockResolvedValue(""),
        ...overrides,
    };
}

describe("LintMcpServersUseCase", () => {
    describe("given no MCP config files discovered", () => {
        it("should return empty results", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new LintMcpServersUseCase(gateway);
            const targetDir = chance.word();

            // Act
            const result = await useCase.execute({ targetDir });

            // Assert
            expect(result.results).toEqual([]);
            expect(result.totalFiles).toBe(0);
            expect(result.totalErrors).toBe(0);
            expect(result.totalWarnings).toBe(0);
        });
    });

    describe("given a config file declaring zero servers", () => {
        it("should report zero server diagnostics and be valid", async () => {
            // Arrange
            const file: DiscoveredMcpConfigFile = {
                filePath: "/repo/.mcp.json",
                relativePath: ".mcp.json",
            };
            const gateway = createMockGateway({
                discoverMcpConfigFiles: vi.fn().mockResolvedValue([file]),
                readFileContent: vi.fn().mockResolvedValue("{}"),
            });
            const useCase = new LintMcpServersUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results).toHaveLength(1);
            expect(result.results[0].valid).toBe(true);
            expect(result.results[0].serverCount).toBe(0);
            expect(result.results[0].diagnostics).toHaveLength(0);
        });
    });

    describe("given a config file declaring multiple servers", () => {
        it("should count each declared server", async () => {
            // Arrange
            const file: DiscoveredMcpConfigFile = {
                filePath: "/repo/.mcp.json",
                relativePath: ".mcp.json",
            };
            const gateway = createMockGateway({
                discoverMcpConfigFiles: vi.fn().mockResolvedValue([file]),
                readFileContent: vi.fn().mockResolvedValue(
                    JSON.stringify({
                        mcpServers: {
                            filesystem: { type: "stdio" },
                            search: { transport: "http" },
                        },
                    }),
                ),
            });
            const useCase = new LintMcpServersUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(true);
            expect(result.results[0].serverCount).toBe(2);
        });
    });

    describe("given a .vscode/mcp.json file using VS Code's 'servers' key", () => {
        it("should count each declared server", async () => {
            // Arrange — VS Code's mcp.json schema uses a top-level "servers"
            // key, not "mcpServers" (see code.claude.com's mcpServers is
            // Claude Code's shared .mcp.json convention; VS Code's own
            // .vscode/mcp.json reference documents "servers").
            const file: DiscoveredMcpConfigFile = {
                filePath: "/repo/.vscode/mcp.json",
                relativePath: ".vscode/mcp.json",
            };
            const gateway = createMockGateway({
                discoverMcpConfigFiles: vi.fn().mockResolvedValue([file]),
                readFileContent: vi.fn().mockResolvedValue(
                    JSON.stringify({
                        servers: {
                            github: { type: "http" },
                            playwright: { command: "npx" },
                        },
                    }),
                ),
            });
            const useCase = new LintMcpServersUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(true);
            expect(result.results[0].serverCount).toBe(2);
        });
    });

    describe("given a server declaration keyed by a reserved property name", () => {
        it("should reject '__proto__' with rule ID mcpserver/invalid-config instead of silently dropping it", async () => {
            // Arrange — zod's record() reconstructs the parsed object via
            // plain assignment, so a "__proto__" key is silently swallowed
            // by the JS magic setter unless explicitly rejected first.
            const file: DiscoveredMcpConfigFile = {
                filePath: "/repo/.mcp.json",
                relativePath: ".mcp.json",
            };
            const gateway = createMockGateway({
                discoverMcpConfigFiles: vi.fn().mockResolvedValue([file]),
                // Built as a raw string (not an object literal) because
                // `{ __proto__: ... }` in JS source sets the prototype via
                // the magic setter rather than creating an own property,
                // which would defeat the point of this test.
                readFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        '{"mcpServers":{"__proto__":{"type":"stdio"},"good":{"type":"stdio"}}}',
                    ),
            });
            const useCase = new LintMcpServersUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            expect(result.results[0].diagnostics[0].ruleId).toBe(
                "mcpserver/invalid-config",
            );
        });
    });

    describe("given a config file with malformed JSON", () => {
        it("should return an error diagnostic with rule ID mcpserver/invalid-json and continue processing other files", async () => {
            // Arrange
            const malformed: DiscoveredMcpConfigFile = {
                filePath: "/repo/.mcp.json",
                relativePath: ".mcp.json",
            };
            const valid: DiscoveredMcpConfigFile = {
                filePath: "/repo/.vscode/mcp.json",
                relativePath: ".vscode/mcp.json",
            };
            const gateway = createMockGateway({
                discoverMcpConfigFiles: vi
                    .fn()
                    .mockResolvedValue([malformed, valid]),
                readFileContent: vi
                    .fn()
                    .mockImplementation(async (filePath: string) =>
                        filePath === malformed.filePath
                            ? "{ not valid json"
                            : "{}",
                    ),
            });
            const useCase = new LintMcpServersUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results).toHaveLength(2);
            expect(result.results[0].valid).toBe(false);
            expect(result.results[0].diagnostics[0].ruleId).toBe(
                "mcpserver/invalid-json",
            );
            expect(result.results[1].valid).toBe(true);
        });
    });

    describe("given a config file whose mcpServers value is not an object", () => {
        it("should return an error diagnostic with rule ID mcpserver/invalid-config", async () => {
            // Arrange
            const file: DiscoveredMcpConfigFile = {
                filePath: "/repo/.mcp.json",
                relativePath: ".mcp.json",
            };
            const gateway = createMockGateway({
                discoverMcpConfigFiles: vi.fn().mockResolvedValue([file]),
                readFileContent: vi
                    .fn()
                    .mockResolvedValue(
                        JSON.stringify({ mcpServers: ["not", "a", "map"] }),
                    ),
            });
            const useCase = new LintMcpServersUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            expect(result.results[0].diagnostics[0].ruleId).toBe(
                "mcpserver/invalid-config",
            );
        });
    });

    describe("given a server entry with an empty transport string", () => {
        it("should return an error diagnostic with rule ID mcpserver/invalid-config", async () => {
            // Arrange
            const file: DiscoveredMcpConfigFile = {
                filePath: "/repo/.mcp.json",
                relativePath: ".mcp.json",
            };
            const gateway = createMockGateway({
                discoverMcpConfigFiles: vi.fn().mockResolvedValue([file]),
                readFileContent: vi.fn().mockResolvedValue(
                    JSON.stringify({
                        mcpServers: { broken: { transport: "" } },
                    }),
                ),
            });
            const useCase = new LintMcpServersUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: "/repo" });

            // Assert
            expect(result.results[0].valid).toBe(false);
            expect(result.results[0].diagnostics[0].ruleId).toBe(
                "mcpserver/invalid-config",
            );
        });
    });

    describe("given an empty target directory", () => {
        it("should throw an error", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new LintMcpServersUseCase(gateway);

            // Act & Assert
            await expect(useCase.execute({ targetDir: "" })).rejects.toThrow(
                "Target directory is required",
            );
        });
    });
});
