import { describe, expect, it } from "vitest";
import {
    AGENTIC_LOCATION_CATALOG,
    type AgenticLocationEntry,
} from "../entities/agentic-location-catalog.js";
import {
    agentDirectoryRoots,
    constructTypesForPath,
    entriesMatchingPath,
    hookConfigPaths,
    instructionDiscoveryEntries,
    lintTargetEntries,
    matchesLocationEntry,
    normalizeRepoRelativePath,
    primaryConstructTypeForPath,
    skillDirectoryRoots,
    subagentDirectoryRoots,
} from "./agentic-location-matchers.js";

describe("normalizeRepoRelativePath", () => {
    describe("when path uses backslashes", () => {
        it("should convert to forward slashes", () => {
            // Arrange
            const input = ".github\\skills\\foo\\SKILL.md";

            // Act
            const result = normalizeRepoRelativePath(input);

            // Assert
            expect(result).toBe(".github/skills/foo/SKILL.md");
        });
    });

    describe("when path has a leading ./", () => {
        it("should strip the leading ./", () => {
            // Arrange
            const input = "./.github/skills/foo/SKILL.md";

            // Act
            const result = normalizeRepoRelativePath(input);

            // Assert
            expect(result).toBe(".github/skills/foo/SKILL.md");
        });

        it("should preserve a repo-relative path with repeated separators", () => {
            // Arrange
            const input = ".//.github/skills/foo/SKILL.md";

            // Act
            const result = normalizeRepoRelativePath(input);

            // Assert
            expect(result).toBe(".github/skills/foo/SKILL.md");
        });
    });

    describe("when path already uses forward slashes", () => {
        it("should leave the path unchanged", () => {
            // Arrange
            const input = ".claude/skills/bar/SKILL.md";

            // Act
            const result = normalizeRepoRelativePath(input);

            // Assert
            expect(result).toBe(input);
        });
    });

    describe("when path contains . or .. segments", () => {
        it("should collapse . and .. without escaping the repo root", () => {
            expect(
                normalizeRepoRelativePath(
                    ".github/skills/foo/../bar/./SKILL.md",
                ),
            ).toBe(".github/skills/bar/SKILL.md");
            expect(
                normalizeRepoRelativePath(".github/skills/foo/../../other.md"),
            ).toBe(".github/other.md");
        });

        it("should yield an empty path when .. escapes the repo root", () => {
            expect(normalizeRepoRelativePath("../etc/passwd")).toBe("");
            expect(
                normalizeRepoRelativePath(".github/../../../etc/passwd"),
            ).toBe("");
        });

        it("should yield an empty path for absolute inputs", () => {
            expect(normalizeRepoRelativePath("/etc/passwd")).toBe("");
            expect(normalizeRepoRelativePath("\\etc\\passwd")).toBe("");
        });

        it("should yield an empty path for Windows drive-letter absolute inputs", () => {
            expect(
                normalizeRepoRelativePath("C:\\repo\\.github\\skills\\x.md"),
            ).toBe("");
            expect(normalizeRepoRelativePath("c:/Users/me/CLAUDE.md")).toBe("");
            expect(
                normalizeRepoRelativePath("D:\\\\.github\\\\skills\\\\x.md"),
            ).toBe("");
        });
    });

    describe("when matching after path traversal segments", () => {
        it("should not treat escaped paths as skills under .github/skills", () => {
            // Collapses to root CLAUDE.md (instruction), not a skill under .github/skills
            expect(
                primaryConstructTypeForPath(
                    ".github/skills/foo/../../../CLAUDE.md",
                ),
            ).toBe("instruction");
            expect(
                primaryConstructTypeForPath(
                    ".github/skills/foo/../../../etc/passwd",
                ),
            ).toBeNull();
            // Intermediate collapse leaves a non-skill path under .github/
            expect(
                primaryConstructTypeForPath(
                    ".github/skills/foo/../../other.md",
                ),
            ).toBeNull();
        });
    });
});

describe("matchesLocationEntry", () => {
    describe("when entry is an exact file match", () => {
        it("should match the exact path", () => {
            // Arrange
            const entry = AGENTIC_LOCATION_CATALOG.find(
                (e) => e.path === "AGENTS.md",
            ) as AgenticLocationEntry;

            // Act / Assert
            expect(matchesLocationEntry("AGENTS.md", entry)).toBe(true);
            expect(matchesLocationEntry("agents.md", entry)).toBe(false);
            expect(matchesLocationEntry("docs/AGENTS.md", entry)).toBe(false);
        });
    });

    describe("when entry is a directory prefix", () => {
        it("should match the directory itself and nested paths", () => {
            // Arrange
            const entry = AGENTIC_LOCATION_CATALOG.find(
                (e) => e.path === ".github/skills",
            ) as AgenticLocationEntry;

            // Act / Assert
            expect(matchesLocationEntry(".github/skills", entry)).toBe(true);
            expect(
                matchesLocationEntry(".github/skills/foo/SKILL.md", entry),
            ).toBe(true);
            expect(matchesLocationEntry(".github/skills-extra", entry)).toBe(
                false,
            );
            expect(matchesLocationEntry(".github/other", entry)).toBe(false);
        });
    });
});

describe("entriesMatchingPath", () => {
    describe("when path matches an exact hook config", () => {
        it("should include the exact entry and the hooks directory prefix", () => {
            // Arrange
            const path = ".github/hooks/agent-shell/hooks.json";

            // Act
            const matches = entriesMatchingPath(path);

            // Assert
            expect(matches.some((e) => e.path === path)).toBe(true);
            expect(matches.some((e) => e.path === ".github/hooks")).toBe(true);
        });
    });

    describe("when path does not match any catalog entry", () => {
        it("should return an empty array", () => {
            // Arrange
            const path = "src/index.ts";

            // Act
            const matches = entriesMatchingPath(path);

            // Assert
            expect(matches).toEqual([]);
        });
    });
});

describe("primaryConstructTypeForPath", () => {
    describe("when path is under a skill directory", () => {
        it("should return skill for known skill roots", () => {
            // Arrange
            const cases = [
                ".github/skills/my-skill/SKILL.md",
                ".claude/skills/my-skill/SKILL.md",
                ".agents/skills/my-skill/SKILL.md",
                ".pi/skills/my-skill/SKILL.md",
                ".pi/prompts/my-prompt/SKILL.md",
            ];

            // Act / Assert
            for (const path of cases) {
                expect(primaryConstructTypeForPath(path)).toBe("skill");
            }
        });
    });

    describe("when path is under .github/agents", () => {
        it("should return agent as the primary construct", () => {
            // Arrange
            const path = ".github/agents/security.md";

            // Act
            const result = primaryConstructTypeForPath(path);

            // Assert
            expect(result).toBe("agent");
        });
    });

    describe("when path is an exact hook config file", () => {
        it("should prefer exact match over directory prefix", () => {
            // Arrange
            const path = ".github/hooks/agent-shell/hooks.json";

            // Act
            const result = primaryConstructTypeForPath(path);

            // Assert
            expect(result).toBe("hook");
        });
    });

    describe("when path is under doctor-only construct prefixes", () => {
        it("should return the mapped construct type", () => {
            // Arrange
            const cases: ReadonlyArray<{
                path: string;
                construct: string;
            }> = [
                { path: ".github/hooks/other/hooks.json", construct: "hook" },
                { path: ".claude/hooks/pre.sh", construct: "hook" },
                { path: ".claude/agents/reviewer.md", construct: "subagent" },
                { path: ".claude/commands/ship.md", construct: "agent" },
                { path: ".codex-plugin/manifest.json", construct: "plugin" },
            ];

            // Act / Assert
            for (const { path, construct } of cases) {
                expect(primaryConstructTypeForPath(path)).toBe(construct);
            }
        });
    });

    describe("when path is a known instruction root file", () => {
        it("should return instruction", () => {
            // Arrange
            const cases = [
                ".github/copilot-instructions.md",
                ".github/instructions/typescript.instructions.md",
                "AGENTS.md",
                "CLAUDE.md",
            ];

            // Act / Assert
            for (const path of cases) {
                expect(primaryConstructTypeForPath(path)).toBe("instruction");
            }
        });
    });

    describe("when path matches nothing", () => {
        it("should return null", () => {
            // Arrange
            const path = "README.md";

            // Act
            const result = primaryConstructTypeForPath(path);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe("when multiple prefixes could match", () => {
        it("should prefer the longest path prefix", () => {
            // Arrange — skill entry is more specific than a hypothetical broad prefix
            const path = ".claude/skills/foo/SKILL.md";

            // Act
            const result = primaryConstructTypeForPath(path);

            // Assert
            expect(result).toBe("skill");
        });
    });
});

describe("constructTypesForPath", () => {
    describe("when path is under .github/agents", () => {
        it("should return agent primary and instruction secondary", () => {
            // Arrange
            const path = ".github/agents/reviewer.md";

            // Act
            const result = constructTypesForPath(path);

            // Assert
            expect(result).toEqual(["agent", "instruction"]);
        });
    });

    describe("when path has only a primary construct", () => {
        it("should return a single-element array", () => {
            // Arrange
            const path = ".github/skills/foo/SKILL.md";

            // Act
            const result = constructTypesForPath(path);

            // Assert
            expect(result).toEqual(["skill"]);
        });
    });

    describe("when path matches nothing", () => {
        it("should return an empty array", () => {
            // Arrange
            const path = "package.json";

            // Act
            const result = constructTypesForPath(path);

            // Assert
            expect(result).toEqual([]);
        });
    });
});

describe("lintTargetEntries", () => {
    describe("when requesting skills", () => {
        it("should return only skill lint directory entries", () => {
            // Act
            const entries = lintTargetEntries("skills");

            // Assert
            expect(entries.length).toBeGreaterThan(0);
            expect(entries.every((e) => e.lintTarget === "skills")).toBe(true);
            expect(entries.map((e) => e.path).sort()).toEqual(
                [
                    ".agents/skills",
                    ".claude/skills",
                    ".github/skills",
                    ".pi/prompts",
                    ".pi/skills",
                ].sort(),
            );
        });
    });

    describe("when requesting agents", () => {
        it("should return the .github/agents entry", () => {
            // Act
            const entries = lintTargetEntries("agents");

            // Assert
            expect(entries.map((e) => e.path)).toEqual([".github/agents"]);
        });
    });

    describe("when requesting hooks", () => {
        it("should return exact hook config paths", () => {
            // Act
            const entries = lintTargetEntries("hooks");

            // Assert
            expect(entries.every((e) => e.matchKind === "exact")).toBe(true);
            expect(entries.map((e) => e.path).sort()).toEqual(
                [
                    ".claude/settings.json",
                    ".claude/settings.local.json",
                    ".github/hooks/agent-shell/hooks.json",
                ].sort(),
            );
        });
    });

    describe("when requesting instructions", () => {
        it("should return instruction lint entries", () => {
            // Act
            const entries = lintTargetEntries("instructions");

            // Assert
            expect(entries.every((e) => e.lintTarget === "instructions")).toBe(
                true,
            );
            expect(entries.map((e) => e.path).sort()).toEqual(
                [
                    ".github/copilot-instructions.md",
                    ".github/instructions",
                    "AGENTS.md",
                    "CLAUDE.md",
                ].sort(),
            );
        });
    });
});

describe("skillDirectoryRoots", () => {
    it("should return all catalog skill directory roots", () => {
        // Act
        const roots = skillDirectoryRoots();

        // Assert
        expect([...roots].sort()).toEqual(
            [
                ".agents/skills",
                ".claude/skills",
                ".github/skills",
                ".pi/prompts",
                ".pi/skills",
            ].sort(),
        );
    });
});

describe("agentDirectoryRoots", () => {
    it("should return .github/agents", () => {
        // Act
        const roots = agentDirectoryRoots();

        // Assert
        expect(roots).toEqual([".github/agents"]);
    });
});

describe("subagentDirectoryRoots", () => {
    it("should return .claude/agents", () => {
        // Act
        const roots = subagentDirectoryRoots();

        // Assert
        expect(roots).toEqual([".claude/agents"]);
    });
});

describe("hookConfigPaths", () => {
    it("should return exact hook configs with platforms", () => {
        // Act
        const paths = hookConfigPaths();

        // Assert
        expect(paths).toEqual(
            expect.arrayContaining([
                {
                    relativePath: ".github/hooks/agent-shell/hooks.json",
                    platform: "copilot",
                },
                {
                    relativePath: ".claude/settings.json",
                    platform: "claude",
                },
                {
                    relativePath: ".claude/settings.local.json",
                    platform: "claude",
                },
            ]),
        );
        expect(paths).toHaveLength(3);
    });
});

describe("instructionDiscoveryEntries", () => {
    it("should include dual-role .github/agents as copilot-agent", () => {
        // Act
        const entries = instructionDiscoveryEntries();

        // Assert
        const agents = entries.find((e) => e.path === ".github/agents");
        expect(agents).toBeDefined();
        expect(agents?.instructionFormat).toBe("copilot-agent");
        expect(agents?.primaryConstruct).toBe("agent");
        expect(agents?.secondaryConstructs).toContain("instruction");
    });

    it("should include all instruction formats", () => {
        // Act
        const formats = instructionDiscoveryEntries()
            .map((e) => e.instructionFormat)
            .sort();

        // Assert
        expect(formats).toEqual(
            [
                "agents-md",
                "claude-md",
                "copilot-agent",
                "copilot-instructions",
                "copilot-scoped",
            ].sort(),
        );
    });
});
