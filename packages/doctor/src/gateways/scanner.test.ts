import {
    lstat,
    mkdir,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MAX_WALK_DEPTH } from "@lousy-agents/core/gateways/repository-walk.js";
import { DEFAULT_MAX_FILE_BYTES } from "@lousy-agents/core/lib/instruction-import-expand.js";
import Chance from "chance";
import { describe, expect, it } from "vitest";
import { scanRepository, scanRepositoryWithReport } from "./scanner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../../tests/fixtures");

const chance = new Chance();

function fixture(name: string): string {
    return resolve(fixturesDir, name);
}

const CLAUDE_MD = "CLAUDE.md";
const AGENTS_MD = "AGENTS.md";
const AGENTS_CONTENT = "# Agents\n";

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
                const records = await scanRepository(repoRoot);

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
            const homeTarget = `~/${chance.word()}.md`;

            await withTempRepo(
                { [CLAUDE_MD]: `@${homeTarget}\n` },
                async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    expect(
                        records.find((r) => r.path === CLAUDE_MD)?.edges,
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
            const instructionPath = `.github/instructions/${chance.word()}.instructions.md`;
            const glob = `${chance.word()}/**/*.ts`;

            await withTempRepo(
                { [instructionPath]: `---\napplyTo: "${glob}"\n---\nBody\n` },
                async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

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
            const files = {
                [CLAUDE_MD]: `@./${AGENTS_MD}\n`,
                [AGENTS_MD]: AGENTS_CONTENT,
            };

            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

                const claudeMd = records.find((r) => r.path === CLAUDE_MD);
                const agentsMd = records.find((r) => r.path === AGENTS_MD);
                expect(claudeMd?.edges).toStrictEqual([
                    {
                        type: "hard-import",
                        direction: { from: CLAUDE_MD, to: AGENTS_MD },
                        target: AGENTS_MD,
                        malformed: false,
                    },
                ]);
                expect(claudeMd?.loadMechanism).toBe("convention-loaded");
                expect(agentsMd?.loadMechanism).toBe("referenced");
            });
        });

        it("should not treat a glob-binding as a reference to the file with the same path", async () => {
            const files = {
                ".github/instructions/a.instructions.md": `---\napplyTo: "${AGENTS_MD}"\n---\n`,
                [AGENTS_MD]: AGENTS_CONTENT,
            };

            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

                expect(
                    records.find((r) => r.path === AGENTS_MD)?.loadMechanism,
                ).toBe("convention-loaded");
            });
        });

        it("should resolve a markdown link relative to the linking file and mark its target referenced", async () => {
            const linkingPath = ".github/instructions/a.instructions.md";
            const files = {
                [linkingPath]: `[guide](../../${AGENTS_MD})\n`,
                [AGENTS_MD]: AGENTS_CONTENT,
            };

            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

                expect(
                    records.find((r) => r.path === linkingPath)?.edges,
                ).toStrictEqual([
                    {
                        type: "soft-reference",
                        direction: { from: linkingPath, to: AGENTS_MD },
                        target: AGENTS_MD,
                        malformed: false,
                    },
                ]);
                expect(
                    records.find((r) => r.path === AGENTS_MD)?.loadMechanism,
                ).toBe("referenced");
            });
        });

        it("should not parse edges from a non-markdown file", async () => {
            const hooksPath = ".github/hooks/agent-shell/hooks.json";
            const files = {
                [hooksPath]: `{"note": "@./${AGENTS_MD}"}`,
                [AGENTS_MD]: AGENTS_CONTENT,
            };

            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

                expect(
                    records.find((r) => r.path === hooksPath)?.edges,
                ).toEqual([]);
                expect(
                    records.find((r) => r.path === AGENTS_MD)?.loadMechanism,
                ).toBe("convention-loaded");
            });
        });

        describe("a markdown file measured against the read limit", () => {
            const ImportLine = `@./${AGENTS_MD}\n`;

            function contentOfLength(length: number): string {
                return ImportLine + "x".repeat(length - ImportLine.length);
            }

            it("should keep a markdown file that is too large to read but record no edges for it", async () => {
                const files = {
                    [CLAUDE_MD]: contentOfLength(DEFAULT_MAX_FILE_BYTES + 1),
                    [AGENTS_MD]: AGENTS_CONTENT,
                };

                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    const claudeMd = records.find((r) => r.path === CLAUDE_MD);
                    expect(claudeMd).toBeDefined();
                    expect(claudeMd?.edges).toEqual([]);
                });
            });

            it("should read a markdown file that is exactly at the limit", async () => {
                const files = {
                    [CLAUDE_MD]: contentOfLength(DEFAULT_MAX_FILE_BYTES),
                    [AGENTS_MD]: AGENTS_CONTENT,
                };

                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    const claudeMd = records.find((r) => r.path === CLAUDE_MD);
                    expect(claudeMd?.edges).toHaveLength(1);
                });
            });
        });

        it("should append mcp-server records after every file record, adding transport only when declared", async () => {
            const declared = chance.word();
            const undeclared = `${chance.word()}x`;
            const files = {
                [CLAUDE_MD]: "# Claude\n",
                ".mcp.json": JSON.stringify({
                    mcpServers: {
                        [declared]: { type: "stdio", command: "npx" },
                        [undeclared]: { command: "npx" },
                    },
                }),
            };

            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

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

    describe("when scanning with the shared walk (doctor lists each logical location)", () => {
        it("should terminate on a directory symlink cycle and inventory the file once", async () => {
            await withTempRepo(
                { ".claude/CLAUDE.md": "# Claude\n" },
                async (repoRoot) => {
                    await symlink(".", join(repoRoot, ".claude", "loop"));

                    const records = await scanRepository(repoRoot);

                    expect(
                        records.filter((r) => r.path.endsWith("CLAUDE.md")),
                    ).toHaveLength(1);
                },
            );
        });

        it("should keep both paths to an aliased directory as separate records, one per logical location", async () => {
            const skill =
                "---\nname: demo\ndescription: demo skill\n---\nbody\n";
            await withTempRepo(
                { ".agents/skills/demo/SKILL.md": skill },
                async (repoRoot) => {
                    await mkdir(join(repoRoot, ".claude"), {
                        recursive: true,
                    });
                    await symlink(
                        "../.agents/skills",
                        join(repoRoot, ".claude", "skills"),
                    );

                    const records = await scanRepository(repoRoot);

                    expect(records.map((r) => r.id).sort()).toEqual([
                        "claude:.claude/skills/demo/SKILL.md",
                        "codex:.agents/skills/demo/SKILL.md",
                    ]);
                },
            );
        });

        it("should read the content of a real file once however many logical locations reach it", async () => {
            const skill =
                "---\nname: demo\ndescription: demo skill\n---\nbody\n";
            const reads: string[] = [];
            await withTempRepo(
                { ".agents/skills/demo/SKILL.md": skill },
                async (repoRoot) => {
                    await mkdir(join(repoRoot, ".claude"), { recursive: true });
                    await symlink(
                        "../.agents/skills",
                        join(repoRoot, ".claude", "skills"),
                    );

                    const records = await scanRepository(repoRoot, {
                        readContent: async (file) => {
                            reads.push(file.relPath);
                            return skill;
                        },
                    });

                    expect(records).toHaveLength(2);
                    expect(reads).toHaveLength(1);
                },
            );
        });

        it("should stop at the directory cap on a diamond of aliases, where each level links three times to the next, and report the limit", async () => {
            const levels = 5;
            const cap = 20;
            await withTempRepo({}, async (repoRoot) => {
                for (let level = 0; level < levels; level += 1) {
                    const directory = join(repoRoot, ".claude", `d${level}`);
                    await mkdir(directory, { recursive: true });
                    await writeFile(join(directory, "f.md"), "# f\n");
                    if (level < levels - 1) {
                        for (const name of ["l1", "l2", "l3"]) {
                            await symlink(
                                `../d${level + 1}`,
                                join(directory, name),
                            );
                        }
                    }
                }

                const report = await scanRepositoryWithReport(repoRoot, {
                    maxDirectories: cap,
                });

                expect(report.directoryLimit).toEqual({ maxDirectories: cap });
                expect(report.records.length).toBeGreaterThan(0);
                expect(report.records.length).toBeLessThanOrEqual(cap);
            });
        });

        describe("when the scanned root is a symlink to the repository", () => {
            it.each([
                ["the path the scan was given", "link"],
                ["the real path of the repository", "real"],
            ])(
                "should resolve an absolute import written with %s as a well-formed edge",
                async (_name, spelling) => {
                    await withTempRepo(
                        { "docs/guide.md": "# guide\n" },
                        async (repoRoot) => {
                            const linkRoot = `${repoRoot}-link`;
                            await symlink(repoRoot, linkRoot);
                            try {
                                const spelledRoot =
                                    spelling === "link" ? linkRoot : repoRoot;
                                await writeFile(
                                    join(repoRoot, CLAUDE_MD),
                                    `@${join(spelledRoot, "docs", "guide.md")}\n`,
                                );

                                const records = await scanRepository(linkRoot);

                                const claudeMd = records.find(
                                    (r) => r.path === CLAUDE_MD,
                                );
                                expect(claudeMd?.edges).toEqual([
                                    expect.objectContaining({
                                        type: "hard-import",
                                        malformed: false,
                                        target: "docs/guide.md",
                                    }),
                                ]);
                            } finally {
                                await rm(linkRoot, { force: true });
                            }
                        },
                    );
                },
            );
        });

        describe("entry budget", () => {
            it("should report the entry limit and keep the records it reached", async () => {
                await withTempRepo(
                    {
                        "CLAUDE.md": "# claude\n",
                        "AGENTS.md": "# agents\n",
                        "docs/a.md": "# a\n",
                        "docs/b.md": "# b\n",
                    },
                    async (repoRoot) => {
                        const report = await scanRepositoryWithReport(
                            repoRoot,
                            { maxEntries: 2 },
                        );

                        expect(report.entryLimit).toEqual({ maxEntries: 2 });
                        expect(report.records.length).toBeGreaterThan(0);
                    },
                );
            });

            it("should report no entry limit when the budget covers the tree", async () => {
                await withTempRepo(
                    { "CLAUDE.md": "# claude\n" },
                    async (repoRoot) => {
                        const report = await scanRepositoryWithReport(
                            repoRoot,
                            {
                                maxEntries: 100,
                            },
                        );

                        expect(report.entryLimit).toBeUndefined();
                    },
                );
            });
        });

        describe("depth limit", () => {
            const chain = (levels: number) =>
                Array.from({ length: levels }, (_, level) => `d${level}`).join(
                    "/",
                );

            it("should report the depth limit when a directory lies below it", async () => {
                await withTempRepo(
                    {
                        "CLAUDE.md": "# claude\n",
                        [`${chain(DEFAULT_MAX_WALK_DEPTH + 1)}/notes.md`]:
                            "# notes\n",
                    },
                    async (repoRoot) => {
                        const report = await scanRepositoryWithReport(repoRoot);

                        expect(report.depthLimit).toEqual({
                            maxDepth: DEFAULT_MAX_WALK_DEPTH,
                        });
                        expect(report.directoryLimit).toBeUndefined();
                    },
                );
            });

            it("should report no depth limit when the deepest directory is exactly at it", async () => {
                await withTempRepo(
                    {
                        [`${chain(DEFAULT_MAX_WALK_DEPTH)}/notes.md`]:
                            "# notes\n",
                    },
                    async (repoRoot) => {
                        const report = await scanRepositoryWithReport(repoRoot);

                        expect(report.depthLimit).toBeUndefined();
                    },
                );
            });
        });

        it("should not parse edges for a non-markdown path because a markdown path to the same file sorts first and is read first", async () => {
            await withTempRepo(
                {
                    ".claude/a-real.md": "@./other.md\n",
                    ".claude/other.md": "# other\n",
                },
                async (repoRoot) => {
                    await symlink(
                        "a-real.md",
                        join(repoRoot, ".claude", "z.json"),
                    );

                    const records = await scanRepository(repoRoot);

                    const markdown = records.find(
                        (r) => r.path === ".claude/a-real.md",
                    );
                    const json = records.find(
                        (r) => r.path === ".claude/z.json",
                    );
                    expect(markdown?.edges).toHaveLength(1);
                    expect(json?.edges).toEqual([]);
                },
            );
        });

        it("should resolve a symlinked file's relative imports from the real target's directory, as Claude Code does", async () => {
            const files = {
                "docs/agents/REAL.md": "@./guide.md\n",
                "docs/agents/guide.md": "# guide\n",
                "guide.md": "# decoy next to the symlink\n",
            };
            await withTempRepo(files, async (repoRoot) => {
                await symlink("docs/agents/REAL.md", join(repoRoot, CLAUDE_MD));

                const records = await scanRepository(repoRoot);

                const claudeMd = records.find((r) => r.path === CLAUDE_MD);
                expect(claudeMd?.edges).toEqual([
                    expect.objectContaining({
                        type: "hard-import",
                        direction: {
                            from: CLAUDE_MD,
                            to: "docs/agents/guide.md",
                        },
                        target: "docs/agents/guide.md",
                        malformed: false,
                    }),
                ]);
            });
        });

        it("should report an import that exists only next to the symlink as missing, because Claude Code resolves from the real target", async () => {
            const files = {
                "docs/agents/REAL.md": "@./guide.md\n",
                "guide.md": "# only next to the symlink\n",
            };
            await withTempRepo(files, async (repoRoot) => {
                await symlink("docs/agents/REAL.md", join(repoRoot, CLAUDE_MD));

                const records = await scanRepository(repoRoot);

                const claudeMd = records.find((r) => r.path === CLAUDE_MD);
                expect(claudeMd?.edges).toEqual([
                    expect.objectContaining({
                        target: "docs/agents/guide.md",
                        malformed: true,
                        reason: "missing-target",
                    }),
                ]);
            });
        });

        it("should resolve an absolute import that points inside the repository, as Claude Code loads it", async () => {
            await withTempRepo(
                { [AGENTS_MD]: AGENTS_CONTENT },
                async (repoRoot) => {
                    await writeFile(
                        join(repoRoot, CLAUDE_MD),
                        `@${join(repoRoot, AGENTS_MD)}\n`,
                    );

                    const records = await scanRepository(repoRoot);

                    const claudeMd = records.find((r) => r.path === CLAUDE_MD);
                    expect(claudeMd?.edges).toEqual([
                        expect.objectContaining({
                            type: "hard-import",
                            target: AGENTS_MD,
                            malformed: false,
                        }),
                    ]);
                },
            );
        });

        it("should resolve a bare @AGENTS.md import, which has no slash", async () => {
            await withTempRepo(
                { [AGENTS_MD]: AGENTS_CONTENT, [CLAUDE_MD]: `@${AGENTS_MD}\n` },
                async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    const claudeMd = records.find((r) => r.path === CLAUDE_MD);
                    expect(claudeMd?.edges).toEqual([
                        expect.objectContaining({
                            type: "hard-import",
                            target: AGENTS_MD,
                            malformed: false,
                        }),
                    ]);
                },
            );
        });

        it.each(["types/node", "no-such-thing"])(
            "should report no edge for a line-start @%s that does not resolve and does not look like a path",
            async (target) => {
                await withTempRepo(
                    { [CLAUDE_MD]: `@${target}\n` },
                    async (repoRoot) => {
                        const records = await scanRepository(repoRoot);

                        expect(
                            records.find((r) => r.path === CLAUDE_MD)?.edges,
                        ).toEqual([]);
                    },
                );
            },
        );

        it("should still report a missing target that looks like a path", async () => {
            await withTempRepo(
                { [CLAUDE_MD]: "@missing.md\n" },
                async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    expect(
                        records.find((r) => r.path === CLAUDE_MD)?.edges,
                    ).toEqual([
                        expect.objectContaining({
                            malformed: true,
                            reason: "missing-target",
                        }),
                    ]);
                },
            );
        });

        it("should resolve a path with a backslash-escaped space to the file with a space in its name", async () => {
            await withTempRepo(
                {
                    "has space.md": "# spaced\n",
                    [CLAUDE_MD]: "@./has\\ space.md\n",
                },
                async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    expect(
                        records.find((r) => r.path === CLAUDE_MD)?.edges,
                    ).toEqual([
                        expect.objectContaining({
                            target: "has space.md",
                            malformed: false,
                        }),
                    ]);
                },
            );
        });

        it("should report no directory limit when the tree is within the cap", async () => {
            await withTempRepo(
                { [CLAUDE_MD]: "# Claude\n" },
                async (repoRoot) => {
                    const report = await scanRepositoryWithReport(repoRoot);

                    expect(report.directoryLimit).toBeUndefined();
                    expect(report.records).toHaveLength(1);
                },
            );
        });

        it.each(["dist", "node_modules/pkg"])(
            "should report a link to a file that exists only under %s as missing, because skipped directories are not part of the scanned repository",
            async (directory) => {
                const files = {
                    [CLAUDE_MD]: `[guide](./${directory}/guide.md)\n`,
                    [`${directory}/guide.md`]: "# guide\n",
                };
                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    const claudeMd = records.find((r) => r.path === CLAUDE_MD);
                    expect(claudeMd?.edges).toEqual([
                        expect.objectContaining({
                            malformed: true,
                            reason: "missing-target",
                        }),
                    ]);
                });
            },
        );

        it("should leave a file under a dist directory out of the inventory, even inside an instruction directory that lint reads", async () => {
            const kept = ".github/instructions/kept.instructions.md";
            const built = ".github/instructions/dist/built.instructions.md";
            const files = {
                [CLAUDE_MD]: "# Claude\n",
                [kept]: "# kept\n",
                [built]: "# built\n",
            };
            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

                const paths = records.map((r) => r.path);
                expect(paths).toContain(kept);
                expect(paths).not.toContain(built);
            });
        });

        it("should treat a file outside the skipped directories as part of the scanned repository", async () => {
            const files = {
                [CLAUDE_MD]: "[guide](./docs/guide.md)\n",
                "docs/guide.md": "# guide\n",
            };
            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

                const claudeMd = records.find((r) => r.path === CLAUDE_MD);
                expect(claudeMd?.edges).toEqual([
                    expect.objectContaining({ malformed: false }),
                ]);
            });
        });
    });

    describe("when CLAUDE.md and AGENTS.md live in subdirectories", () => {
        const shallowDir = "src";
        const deepDir = "packages/foo";
        const shallowClaude = `${shallowDir}/${CLAUDE_MD}`;
        const deepClaude = `${deepDir}/${CLAUDE_MD}`;
        const shallowAgents = `${shallowDir}/${AGENTS_MD}`;
        const deepAgents = `${deepDir}/${AGENTS_MD}`;
        const claudeBody = "# Nested Claude\n";
        const agentsBody = "# Nested Agents\n";

        function instructionAt(
            records: Awaited<ReturnType<typeof scanRepository>>,
            path: string,
        ) {
            return records.find((record) => record.path === path);
        }

        function instructionShape(path: string, harness: "claude" | "shared") {
            return expect.objectContaining({
                id: `${harness}:${path}`,
                path,
                harness,
                constructType: "instruction",
                loadMechanism: "convention-loaded",
            });
        }

        describe("when the repository has no instruction file at the root", () => {
            it("should inventory CLAUDE.md at more than one directory depth as a claude instruction", async () => {
                const readme = `${shallowDir}/README.md`;
                const files = {
                    [shallowClaude]: claudeBody,
                    [deepClaude]: claudeBody,
                    [readme]: "# Readme\n",
                };

                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    expect(instructionAt(records, shallowClaude)).toEqual(
                        instructionShape(shallowClaude, "claude"),
                    );
                    expect(instructionAt(records, deepClaude)).toEqual(
                        instructionShape(deepClaude, "claude"),
                    );
                    expect(records.map((record) => record.path)).not.toContain(
                        readme,
                    );
                    expect(
                        records.some((record) => record.path === CLAUDE_MD),
                    ).toBe(false);
                });
            });

            it("should inventory AGENTS.md at more than one directory depth as a shared instruction", async () => {
                const files = {
                    [shallowAgents]: agentsBody,
                    [deepAgents]: agentsBody,
                };

                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    expect(instructionAt(records, shallowAgents)).toEqual(
                        instructionShape(shallowAgents, "shared"),
                    );
                    expect(instructionAt(records, deepAgents)).toEqual(
                        instructionShape(deepAgents, "shared"),
                    );
                    expect(
                        records.some((record) => record.path === AGENTS_MD),
                    ).toBe(false);
                });
            });
        });

        describe("when the repository also has root instruction files", () => {
            it("should inventory the root files and the nested files together", async () => {
                const files = {
                    [CLAUDE_MD]: claudeBody,
                    [AGENTS_MD]: agentsBody,
                    [shallowClaude]: claudeBody,
                    [deepClaude]: claudeBody,
                    [shallowAgents]: agentsBody,
                    [deepAgents]: agentsBody,
                };

                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(repoRoot);

                    expect(instructionAt(records, CLAUDE_MD)).toEqual(
                        instructionShape(CLAUDE_MD, "claude"),
                    );
                    expect(instructionAt(records, AGENTS_MD)).toEqual(
                        instructionShape(AGENTS_MD, "shared"),
                    );
                    expect(instructionAt(records, shallowClaude)).toEqual(
                        instructionShape(shallowClaude, "claude"),
                    );
                    expect(instructionAt(records, deepClaude)).toEqual(
                        instructionShape(deepClaude, "claude"),
                    );
                    expect(instructionAt(records, shallowAgents)).toEqual(
                        instructionShape(shallowAgents, "shared"),
                    );
                    expect(instructionAt(records, deepAgents)).toEqual(
                        instructionShape(deepAgents, "shared"),
                    );
                });
            });
        });

        describe("when a copy sits in a directory the scan skips", () => {
            it.each([
                "node_modules/pkg",
                ".git",
                "dist",
                "packages/foo/node_modules/pkg",
                "packages/foo/dist",
            ])(
                "should inventory a nested instruction file and leave copies under %s out of the inventory",
                async (skipped) => {
                    const skippedClaude = `${skipped}/${CLAUDE_MD}`;
                    const skippedAgents = `${skipped}/${AGENTS_MD}`;
                    const files = {
                        [shallowClaude]: claudeBody,
                        [skippedClaude]: claudeBody,
                        [skippedAgents]: agentsBody,
                    };

                    await withTempRepo(files, async (repoRoot) => {
                        const records = await scanRepository(repoRoot);
                        const paths = records.map((record) => record.path);

                        expect(paths).toContain(shallowClaude);
                        expect(paths).not.toContain(skippedClaude);
                        expect(paths).not.toContain(skippedAgents);
                    });
                },
            );
        });

        describe("when the same filename sits inside a directory another harness owns", () => {
            it("should keep CLAUDE.md under .github/agents as a copilot agent", async () => {
                const agentPath = `.github/agents/${CLAUDE_MD}`;

                await withTempRepo(
                    { [agentPath]: claudeBody },
                    async (repoRoot) => {
                        const records = await scanRepository(repoRoot);

                        expect(
                            records.find((record) => record.path === agentPath),
                        ).toEqual(
                            expect.objectContaining({
                                harness: "copilot",
                                constructType: "agent",
                            }),
                        );
                    },
                );
            });

            it("should keep AGENTS.md under .claude/skills as a claude skill", async () => {
                const skillPath = `.claude/skills/example/${AGENTS_MD}`;

                await withTempRepo(
                    { [skillPath]: agentsBody },
                    async (repoRoot) => {
                        const records = await scanRepository(repoRoot);

                        expect(
                            records.find((record) => record.path === skillPath),
                        ).toEqual(
                            expect.objectContaining({
                                harness: "claude",
                                constructType: "skill",
                            }),
                        );
                    },
                );
            });
        });
    });

    describe("when a fixture directory is met during the walk", () => {
        const keptClaude = `src/${CLAUDE_MD}`;
        const keptAgents = `packages/foo/${AGENTS_MD}`;
        const body = "# Instructions\n";
        const sourceFixtures = `src/fixtures/${CLAUDE_MD}`;

        it.each([
            "tests/fixtures/case",
            "packages/doctor/tests/fixtures/malformed-edge",
            "pkg/__fixtures__/case",
            "a/b/testdata",
        ])(
            "should leave instruction files under %s out of the inventory and keep ones outside it",
            async (fixtureDir) => {
                const fixtureClaude = `${fixtureDir}/${CLAUDE_MD}`;
                const fixtureAgents = `${fixtureDir}/nested/${AGENTS_MD}`;
                const files = {
                    [keptClaude]: body,
                    [keptAgents]: body,
                    [fixtureClaude]: "@./missing.md\n",
                    [fixtureAgents]: body,
                };

                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(repoRoot);
                    const paths = records.map((record) => record.path);

                    expect(paths).toContain(keptClaude);
                    expect(paths).toContain(keptAgents);
                    expect(paths).not.toContain(fixtureClaude);
                    expect(paths).not.toContain(fixtureAgents);
                });
            },
        );

        it("should inventory a CLAUDE.md under a fixtures directory that is not tests/fixtures", async () => {
            const files = { [sourceFixtures]: body };

            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

                expect(records.map((record) => record.path)).toContain(
                    sourceFixtures,
                );
            });
        });

        describe("when the directory given as the root is a fixture directory", () => {
            it("should inventory CLAUDE.md in that directory", async () => {
                const fixtureRoot = "tests/fixtures/malformed-edge";
                const files = {
                    [`${fixtureRoot}/${CLAUDE_MD}`]:
                        "@./nonexistent-target.md\n",
                    [keptClaude]: body,
                };

                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(
                        join(repoRoot, fixtureRoot),
                    );

                    expect(
                        records.find((record) => record.path === CLAUDE_MD),
                    ).toEqual(
                        expect.objectContaining({
                            path: CLAUDE_MD,
                            harness: "claude",
                            constructType: "instruction",
                        }),
                    );
                    expect(
                        records.some((record) => record.path === keptClaude),
                    ).toBe(false);
                });
            });

            it("should inventory files inside tests/fixtures when that directory is the root", async () => {
                const nested = `case/${CLAUDE_MD}`;
                const files = {
                    [`tests/fixtures/${nested}`]: body,
                    [keptClaude]: body,
                };

                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(
                        join(repoRoot, "tests/fixtures"),
                    );

                    expect(records.map((record) => record.path)).toEqual([
                        nested,
                    ]);
                });
            });

            it("should still report the intentional missing import in the malformed-edge fixture", async () => {
                const records = await scanRepository(fixture("malformed-edge"));

                expect(
                    records.find((record) => record.path === CLAUDE_MD)?.edges,
                ).toEqual([
                    expect.objectContaining({
                        malformed: true,
                        reason: "missing-target",
                    }),
                ]);
            });

            it("should leave fixtures out when the scan root is the tests directory", async () => {
                const kept = `src/${CLAUDE_MD}`;
                const fixtureClaude = `fixtures/malformed-edge/${CLAUDE_MD}`;
                const files = {
                    [`tests/${kept}`]: body,
                    [`tests/${fixtureClaude}`]: "@./missing.md\n",
                };

                await withTempRepo(files, async (repoRoot) => {
                    const records = await scanRepository(
                        join(repoRoot, "tests"),
                    );
                    const paths = records.map((record) => record.path);

                    expect(paths).toContain(kept);
                    expect(paths).not.toContain(fixtureClaude);
                });
            });
        });
    });

    describe("when CLAUDE.md or AGENTS.md sits in .github/instructions", () => {
        const claudeInInstructions = `.github/instructions/${CLAUDE_MD}`;
        const agentsInInstructions = `.github/instructions/${AGENTS_MD}`;
        const readme = ".github/instructions/README.md";
        const body = "# Instructions\n";

        it("should inventory them as claude and shared instructions", async () => {
            const files = {
                [claudeInInstructions]: body,
                [agentsInInstructions]: body,
                [readme]: body,
            };

            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

                expect(
                    records.find(
                        (record) => record.path === claudeInInstructions,
                    ),
                ).toEqual(
                    expect.objectContaining({
                        id: `claude:${claudeInInstructions}`,
                        harness: "claude",
                        constructType: "instruction",
                    }),
                );
                expect(
                    records.find(
                        (record) => record.path === agentsInInstructions,
                    ),
                ).toEqual(
                    expect.objectContaining({
                        id: `shared:${agentsInInstructions}`,
                        harness: "shared",
                        constructType: "instruction",
                    }),
                );
                expect(records.map((record) => record.path)).not.toContain(
                    readme,
                );
            });
        });
    });

    describe("when AGENTS.MD uses a capital MD extension", () => {
        const rootAgents = "AGENTS.MD";
        const nestedAgents = "packages/foo/AGENTS.MD";
        const body = "# Agents\n";

        it("should inventory the root and nested files as shared instructions", async () => {
            const files = {
                [rootAgents]: body,
                [nestedAgents]: body,
            };

            await withTempRepo(files, async (repoRoot) => {
                const records = await scanRepository(repoRoot);

                expect(
                    records.find((record) => record.path === rootAgents),
                ).toEqual(
                    expect.objectContaining({
                        id: `shared:${rootAgents}`,
                        harness: "shared",
                        constructType: "instruction",
                    }),
                );
                expect(
                    records.find((record) => record.path === nestedAgents),
                ).toEqual(
                    expect.objectContaining({
                        id: `shared:${nestedAgents}`,
                        harness: "shared",
                        constructType: "instruction",
                    }),
                );
            });
        });
    });
});
