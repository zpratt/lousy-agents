import { lstat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanRepository } from "./scanner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../../tests/fixtures");

function fixture(name: string): string {
    return resolve(fixturesDir, name);
}

describe("scanRepository", () => {
    describe("when scanning a pure-claude repository", () => {
        it("should return one convention-loaded instruction record with harness 'claude'", async () => {
            const records = await scanRepository(fixture("pure-claude"));

            const claudeRecords = records.filter((r) => r.harness === "claude");
            expect(claudeRecords).toHaveLength(1);
            expect(claudeRecords[0].loadMechanism).toBe("convention-loaded");
            expect(claudeRecords[0].constructType).toBe("instruction");
        });

        it("should assign id in '${harness}:${path}' format", async () => {
            const records = await scanRepository(fixture("pure-claude"));
            for (const r of records) {
                expect(r.id).toMatch(/^[a-z-]+:.+/);
            }
        });

        it("should return no edges", async () => {
            const records = await scanRepository(fixture("pure-claude"));
            const allEdges = records.flatMap((r) => r.edges);
            expect(allEdges).toHaveLength(0);
        });
    });

    describe("when scanning a subagent-construct repository", () => {
        it("should classify a file under .claude/agents/ as constructType 'subagent'", async () => {
            const records = await scanRepository(fixture("subagent-construct"));

            const subagentRecord = records.find((r) =>
                r.path.endsWith("reviewer.md"),
            );
            expect(subagentRecord).toBeDefined();
            expect(subagentRecord?.constructType).toBe("subagent");
        });

        it("should still classify a file under .claude/commands/ as constructType 'agent'", async () => {
            const records = await scanRepository(fixture("subagent-construct"));

            const commandRecord = records.find((r) =>
                r.path.endsWith("deploy.md"),
            );
            expect(commandRecord).toBeDefined();
            expect(commandRecord?.constructType).toBe("agent");
        });
    });

    describe("when scanning a repository with a multi-server MCP config", () => {
        it("should emit one mcp-server record per declared server", async () => {
            const records = await scanRepository(fixture("mcp-multi-server"));

            const mcpRecords = records.filter(
                (r) => r.constructType === "mcp-server",
            );
            expect(mcpRecords).toHaveLength(2);
        });

        it("should assign unique ids in 'mcp-server:<path>#<serverName>' format", async () => {
            const records = await scanRepository(fixture("mcp-multi-server"));

            const mcpRecords = records.filter(
                (r) => r.constructType === "mcp-server",
            );
            const ids = mcpRecords.map((r) => r.id);
            expect(ids).toContain("mcp-server:.mcp.json#filesystem");
            expect(ids).toContain("mcp-server:.mcp.json#search");
            expect(new Set(ids).size).toBe(ids.length);
        });

        it("should set loadMechanism to 'convention-loaded' for MCP server records", async () => {
            const records = await scanRepository(fixture("mcp-multi-server"));

            const mcpRecords = records.filter(
                (r) => r.constructType === "mcp-server",
            );
            for (const record of mcpRecords) {
                expect(record.loadMechanism).toBe("convention-loaded");
            }
        });

        it("should attribute .mcp.json MCP server records to the shared harness since both Claude and Copilot read it", async () => {
            const records = await scanRepository(fixture("mcp-multi-server"));

            const mcpRecords = records.filter(
                (r) => r.constructType === "mcp-server",
            );
            for (const record of mcpRecords) {
                expect(record.harness).toBe("shared");
            }
        });
    });

    describe("when scanning an intentional-hybrid repository", () => {
        it("should detect a soft-reference edge from CLAUDE.md to the Copilot instruction file", async () => {
            const records = await scanRepository(fixture("intentional-hybrid"));

            const claudeRecord = records.find(
                (r) => r.harness === "claude" && r.path.endsWith("CLAUDE.md"),
            );
            expect(claudeRecord).toBeDefined();

            const softRef = claudeRecord?.edges.find(
                (e) => e.type === "soft-reference",
            );
            expect(softRef).toBeDefined();
            expect(softRef?.direction.from).toContain("CLAUDE.md");
            expect(softRef?.direction.to).toContain("services.instructions.md");
        });

        it("should detect a hard-import edge from CLAUDE.md to the Copilot instruction file", async () => {
            const records = await scanRepository(fixture("intentional-hybrid"));

            const claudeRecord = records.find(
                (r) => r.harness === "claude" && r.path.endsWith("CLAUDE.md"),
            );
            expect(claudeRecord).toBeDefined();

            const hardImport = claudeRecord?.edges.find(
                (e) => e.type === "hard-import",
            );
            expect(hardImport).toBeDefined();
            expect(hardImport?.malformed).toBe(false);
        });

        it("should assign referenced load mechanism to targets named by an inbound edge", async () => {
            const records = await scanRepository(fixture("intentional-hybrid"));

            const servicesRecord = records.find((r) =>
                r.path.endsWith("services.instructions.md"),
            );
            expect(servicesRecord).toBeDefined();
            expect(servicesRecord?.loadMechanism).toBe("referenced");
        });
    });

    describe("when scanning an accidental-sprawl repository", () => {
        it("should return zero cross-harness hard-import or soft-reference edges", async () => {
            const records = await scanRepository(fixture("accidental-sprawl"));

            const crossHarnessEdges = records.flatMap((r) =>
                r.edges.filter(
                    (e) =>
                        (e.type === "hard-import" ||
                            e.type === "soft-reference") &&
                        !e.malformed,
                ),
            );
            expect(crossHarnessEdges).toHaveLength(0);
        });

        it("should discover both claude and copilot constructs", async () => {
            const records = await scanRepository(fixture("accidental-sprawl"));

            const harnesses = new Set(records.map((r) => r.harness));
            expect(harnesses).toContain("claude");
            expect(harnesses).toContain("copilot");
        });
    });

    describe("when scanning a canonical-contract repository", () => {
        it("should discover AGENTS.md with harness 'shared'", async () => {
            const records = await scanRepository(fixture("canonical-contract"));

            const agentsMd = records.find((r) => r.path.endsWith("AGENTS.md"));
            expect(agentsMd).toBeDefined();
            expect(agentsMd?.harness).toBe("shared");
        });

        it("should assign id as 'shared:AGENTS.md'", async () => {
            const records = await scanRepository(fixture("canonical-contract"));

            const agentsMd = records.find((r) => r.path.endsWith("AGENTS.md"));
            expect(agentsMd?.id).toBe("shared:AGENTS.md");
        });
    });

    describe("when scanning a repository with a symlinked instructions directory", () => {
        it.skipIf(process.platform === "win32")(
            "should have a symlink fixture at .claude, so this test actually exercises symlink handling",
            async () => {
                const stats = await lstat(
                    resolve(fixture("symlinked-instructions-dir"), ".claude"),
                );
                expect(stats.isSymbolicLink()).toBe(true);
            },
        );

        it("should discover a file nested inside the symlinked directory", async () => {
            const records = await scanRepository(
                fixture("symlinked-instructions-dir"),
            );

            const claudeMd = records.find(
                (r) => r.path === ".claude/CLAUDE.md",
            );
            expect(claudeMd).toBeDefined();
            expect(claudeMd?.harness).toBe("claude");
        });
    });

    describe("when scanning a repository with an empty-repo fixture", () => {
        it("should return an empty inventory", async () => {
            const records = await scanRepository(fixture("empty-repo"));
            expect(records).toHaveLength(0);
        });
    });

    describe("when scanning a repository with a malformed edge", () => {
        it("should record the edge as malformed with reason 'missing-target'", async () => {
            const records = await scanRepository(fixture("malformed-edge"));

            const claudeRecord = records.find(
                (r) => r.harness === "claude" && r.path.endsWith("CLAUDE.md"),
            );
            expect(claudeRecord).toBeDefined();

            const malformedEdge = claudeRecord?.edges.find(
                (e) => e.malformed && e.reason === "missing-target",
            );
            expect(malformedEdge).toBeDefined();
        });

        it("should retain malformed edges in the inventory", async () => {
            const records = await scanRepository(fixture("malformed-edge"));

            const allEdges = records.flatMap((r) => r.edges);
            expect(allEdges.length).toBeGreaterThan(0);
        });
    });

    describe("when scanning a repository with a path-traversal reference", () => {
        it("should record the edge as malformed with reason 'path-traversal'", async () => {
            const records = await scanRepository(fixture("path-traversal"));

            const allEdges = records.flatMap((r) => r.edges);
            const traversalEdge = allEdges.find(
                (e) => e.malformed && e.reason === "path-traversal",
            );
            expect(traversalEdge).toBeDefined();
        });

        it("should not read the file at the outside-root path", async () => {
            await expect(
                scanRepository(fixture("path-traversal")),
            ).resolves.not.toThrow();
        });
    });

    describe("InventoryRecord id format", () => {
        it("should produce ids matching the ${harness}:${path} pattern for all records", async () => {
            const records = await scanRepository(fixture("accidental-sprawl"));

            for (const r of records) {
                expect(r.id).toMatch(/^[a-z-]+:.+/);
                expect(r.id.startsWith(`${r.harness}:`)).toBe(true);
            }
        });
    });

    describe("EdgeDirection fields", () => {
        it("should set non-empty from and to on all edges in intentional-hybrid fixture", async () => {
            const records = await scanRepository(fixture("intentional-hybrid"));

            const allEdges = records.flatMap((r) => r.edges);
            for (const edge of allEdges) {
                expect(edge.direction.from).toBeTruthy();
                expect(edge.direction.to).toBeTruthy();
            }
        });
    });
});
