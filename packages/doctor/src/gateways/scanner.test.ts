import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Chance from "chance";
import { describe, expect, it } from "vitest";
import { scanRepository } from "./scanner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../../tests/fixtures");

const chance = new Chance();

function fixture(name: string): string {
    return resolve(fixturesDir, name);
}

async function withTempRepo(
    files: Record<string, string>,
    run: (repoRoot: string) => Promise<void>,
): Promise<void> {
    const repoRoot = join(
        await realpath(tmpdir()),
        `doctor-scanner-${chance.guid()}`,
    );
    try {
        for (const [relPath, content] of Object.entries(files)) {
            await mkdir(dirname(join(repoRoot, relPath)), { recursive: true });
            await writeFile(join(repoRoot, relPath), content);
        }
        await run(repoRoot);
    } finally {
        await rm(repoRoot, { recursive: true, force: true });
    }
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

    describe("when scanning a repository with a symlink that escapes the repo root", () => {
        it.skipIf(process.platform === "win32")(
            "should have a symlink fixture at AGENTS.md pointing outside the repo root, so this test actually exercises the traversal guard",
            async () => {
                const stats = await lstat(
                    resolve(fixture("symlinked-outside-root"), "AGENTS.md"),
                );
                expect(stats.isSymbolicLink()).toBe(true);
            },
        );

        it("should not inventory a symlinked file whose resolved target lives outside the repo root", async () => {
            const records = await scanRepository(
                fixture("symlinked-outside-root"),
            );

            const agentsMd = records.find((r) => r.path === "AGENTS.md");
            expect(agentsMd).toBeUndefined();
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

    describe("when scanning a repository with catalogued skills, agents, and hooks", () => {
        const catalogFixture = "copilot-skills-agents-hooks";

        it("should inventory a scannable file under .github/skills/ as constructType 'skill'", async () => {
            const records = await scanRepository(fixture(catalogFixture));

            const skillRecord = records.find(
                (r) => r.path === ".github/skills/sample-skill/SKILL.md",
            );
            expect(skillRecord).toBeDefined();
            expect(skillRecord?.constructType).toBe("skill");
            expect(skillRecord?.harness).toBe("copilot");
        });

        it("should inventory a scannable file under .github/agents/ as constructType 'agent' (single record)", async () => {
            const records = await scanRepository(fixture(catalogFixture));

            const agentRecords = records.filter(
                (r) => r.path === ".github/agents/demo.md",
            );
            expect(agentRecords).toHaveLength(1);
            expect(agentRecords[0]?.constructType).toBe("agent");
            expect(agentRecords[0]?.harness).toBe("copilot");
        });

        it("should inventory .github/hooks/agent-shell/hooks.json as constructType 'hook'", async () => {
            const records = await scanRepository(fixture(catalogFixture));

            const hookRecord = records.find(
                (r) => r.path === ".github/hooks/agent-shell/hooks.json",
            );
            expect(hookRecord).toBeDefined();
            expect(hookRecord?.constructType).toBe("hook");
            expect(hookRecord?.harness).toBe("copilot");
        });

        it("should inventory a scannable file under .claude/skills/ as constructType 'skill', not 'instruction'", async () => {
            const records = await scanRepository(fixture(catalogFixture));

            const skillRecord = records.find(
                (r) => r.path === ".claude/skills/sample-skill/SKILL.md",
            );
            expect(skillRecord).toBeDefined();
            expect(skillRecord?.constructType).toBe("skill");
            expect(skillRecord?.constructType).not.toBe("instruction");
            expect(skillRecord?.harness).toBe("claude");
        });

        it("should continue to inventory .agents/skills/ as constructType 'skill'", async () => {
            const records = await scanRepository(fixture(catalogFixture));

            const skillRecord = records.find(
                (r) => r.path === ".agents/skills/sample-skill/SKILL.md",
            );
            expect(skillRecord).toBeDefined();
            expect(skillRecord?.constructType).toBe("skill");
        });
    });

    describe("when CLAUDE.md imports an absolute path", () => {
        it("should record the edge as malformed with reason 'absolute'", async () => {
            // Arrange
            const repoRoot = join(
                await realpath(tmpdir()),
                `doctor-absolute-import-${chance.guid()}`,
            );
            const absoluteTarget = `/${chance.word()}/${chance.word()}.md`;
            await mkdir(repoRoot, { recursive: true });
            await writeFile(
                join(repoRoot, "CLAUDE.md"),
                `# Claude\n\n@${absoluteTarget}\n`,
            );

            try {
                // Act
                const records = await scanRepository(repoRoot);

                // Assert
                const claudeMd = records.find((r) => r.path === "CLAUDE.md");
                expect(claudeMd?.edges).toEqual([
                    expect.objectContaining({
                        target: absoluteTarget,
                        malformed: true,
                        reason: "absolute",
                    }),
                ]);
            } finally {
                await rm(repoRoot, { recursive: true, force: true });
            }
        });
    });

    describe("when scanning inline repositories (inventory characterization)", () => {
        it("should record a '~/' import as malformed with reason 'home'", async () => {
            // Arrange
            const homeTarget = `~/${chance.word()}.md`;

            await withTempRepo(
                { "CLAUDE.md": `@${homeTarget}\n` },
                async (repoRoot) => {
                    // Act
                    const records = await scanRepository(repoRoot);

                    // Assert
                    expect(
                        records.find((r) => r.path === "CLAUDE.md")?.edges,
                    ).toEqual([
                        expect.objectContaining({
                            type: "hard-import",
                            target: homeTarget,
                            malformed: true,
                            reason: "home",
                        }),
                    ]);
                },
            );
        });

        it("should record an applyTo glob as a well-formed glob-binding edge", async () => {
            // Arrange
            const instructionPath = `.github/instructions/${chance.word()}.instructions.md`;
            const glob = `${chance.word()}/**/*.ts`;

            await withTempRepo(
                { [instructionPath]: `---\napplyTo: "${glob}"\n---\nBody\n` },
                async (repoRoot) => {
                    // Act
                    const records = await scanRepository(repoRoot);

                    // Assert
                    expect(
                        records.find((r) => r.path === instructionPath)?.edges,
                    ).toStrictEqual([
                        {
                            type: "glob-binding",
                            direction: { from: instructionPath, to: glob },
                            target: glob,
                            malformed: false,
                        },
                    ]);
                },
            );
        });

        it("should mark the target of a resolved @import as referenced and leave the importer convention-loaded", async () => {
            // Arrange
            const files = {
                "CLAUDE.md": "@./AGENTS.md\n",
                "AGENTS.md": "# Agents\n",
            };

            await withTempRepo(files, async (repoRoot) => {
                // Act
                const records = await scanRepository(repoRoot);

                // Assert
                const claudeMd = records.find((r) => r.path === "CLAUDE.md");
                const agentsMd = records.find((r) => r.path === "AGENTS.md");
                expect(claudeMd?.edges).toStrictEqual([
                    {
                        type: "hard-import",
                        direction: { from: "CLAUDE.md", to: "AGENTS.md" },
                        target: "AGENTS.md",
                        malformed: false,
                    },
                ]);
                expect(claudeMd?.loadMechanism).toBe("convention-loaded");
                expect(agentsMd?.loadMechanism).toBe("referenced");
            });
        });

        it("should not treat a glob-binding as a reference to the file with the same path", async () => {
            // Arrange
            const files = {
                ".github/instructions/a.instructions.md":
                    '---\napplyTo: "AGENTS.md"\n---\n',
                "AGENTS.md": "# Agents\n",
            };

            await withTempRepo(files, async (repoRoot) => {
                // Act
                const records = await scanRepository(repoRoot);

                // Assert
                expect(
                    records.find((r) => r.path === "AGENTS.md")?.loadMechanism,
                ).toBe("convention-loaded");
            });
        });

        it("should resolve a markdown link relative to the linking file and mark its target referenced", async () => {
            // Arrange
            const linkingPath = ".github/instructions/a.instructions.md";
            const files = {
                [linkingPath]: "[guide](../../AGENTS.md)\n",
                "AGENTS.md": "# Agents\n",
            };

            await withTempRepo(files, async (repoRoot) => {
                // Act
                const records = await scanRepository(repoRoot);

                // Assert
                expect(
                    records.find((r) => r.path === linkingPath)?.edges,
                ).toStrictEqual([
                    {
                        type: "soft-reference",
                        direction: { from: linkingPath, to: "AGENTS.md" },
                        target: "AGENTS.md",
                        malformed: false,
                    },
                ]);
                expect(
                    records.find((r) => r.path === "AGENTS.md")?.loadMechanism,
                ).toBe("referenced");
            });
        });

        it("should not parse edges from a non-markdown file", async () => {
            // Arrange
            const hooksPath = ".github/hooks/agent-shell/hooks.json";
            const files = {
                [hooksPath]: '{"note": "@./AGENTS.md"}',
                "AGENTS.md": "# Agents\n",
            };

            await withTempRepo(files, async (repoRoot) => {
                // Act
                const records = await scanRepository(repoRoot);

                // Assert
                expect(
                    records.find((r) => r.path === hooksPath)?.edges,
                ).toEqual([]);
                expect(
                    records.find((r) => r.path === "AGENTS.md")?.loadMechanism,
                ).toBe("convention-loaded");
            });
        });

        it("should keep a markdown file that is too large to read but record no edges for it", async () => {
            // Arrange
            const oversizedContent = `@./AGENTS.md\n${"x".repeat(1_048_576)}`;
            const files = {
                "CLAUDE.md": oversizedContent,
                "AGENTS.md": "# Agents\n",
            };

            await withTempRepo(files, async (repoRoot) => {
                // Act
                const records = await scanRepository(repoRoot);

                // Assert
                const claudeMd = records.find((r) => r.path === "CLAUDE.md");
                expect(claudeMd).toBeDefined();
                expect(claudeMd?.edges).toEqual([]);
            });
        });

        it("should append mcp-server records after every file record, adding transport only when declared", async () => {
            // Arrange
            const declared = chance.word();
            const undeclared = `${chance.word()}x`;
            const files = {
                "CLAUDE.md": "# Claude\n",
                ".mcp.json": JSON.stringify({
                    mcpServers: {
                        [declared]: { type: "stdio", command: "npx" },
                        [undeclared]: { command: "npx" },
                    },
                }),
            };

            await withTempRepo(files, async (repoRoot) => {
                // Act
                const records = await scanRepository(repoRoot);

                // Assert
                const firstMcpIndex = records.findIndex(
                    (r) => r.constructType === "mcp-server",
                );
                const trailing = records.slice(firstMcpIndex);
                expect(firstMcpIndex).toBeGreaterThan(0);
                expect(
                    trailing.every((r) => r.constructType === "mcp-server"),
                ).toBe(true);
                expect(trailing).toStrictEqual([
                    {
                        id: `mcp-server:.mcp.json#${declared}`,
                        path: ".mcp.json",
                        harness: "shared",
                        constructType: "mcp-server",
                        loadMechanism: "convention-loaded",
                        edges: [],
                        serverName: declared,
                        transport: "stdio",
                    },
                    {
                        id: `mcp-server:.mcp.json#${undeclared}`,
                        path: ".mcp.json",
                        harness: "shared",
                        constructType: "mcp-server",
                        loadMechanism: "convention-loaded",
                        edges: [],
                        serverName: undeclared,
                    },
                ]);
            });
        });
    });
});
