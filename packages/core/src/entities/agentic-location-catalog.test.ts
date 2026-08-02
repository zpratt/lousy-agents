import { describe, expect, it } from "vitest";
import {
    AGENTIC_LOCATION_CATALOG,
    type AgenticLocationEntry,
} from "./agentic-location-catalog.js";

function entriesByLintTarget(
    target: AgenticLocationEntry["lintTarget"],
): readonly AgenticLocationEntry[] {
    return AGENTIC_LOCATION_CATALOG.filter(
        (entry) => entry.lintTarget === target,
    );
}

function findByPath(path: string): AgenticLocationEntry | undefined {
    return AGENTIC_LOCATION_CATALOG.find((entry) => entry.path === path);
}

describe("AGENTIC_LOCATION_CATALOG", () => {
    describe("when encoding skill lint directories", () => {
        it("should include .github/skills, .claude/skills, and .agents/skills as skill roots", () => {
            // Arrange
            const expectedPaths = [
                ".github/skills",
                ".claude/skills",
                ".agents/skills",
            ];

            // Act
            const skillEntries = entriesByLintTarget("skills");

            // Assert
            for (const path of expectedPaths) {
                const entry = skillEntries.find((e) => e.path === path);
                expect(entry).toBeDefined();
                expect(entry?.matchKind).toBe("directory-prefix");
                expect(entry?.primaryConstruct).toBe("skill");
                expect(entry?.lintTarget).toBe("skills");
            }
        });
    });

    describe("when encoding agent lint directories", () => {
        it("should include .github/agents as agent primary with instruction secondary", () => {
            // Arrange / Act
            const entry = findByPath(".github/agents");

            // Assert
            expect(entry).toBeDefined();
            expect(entry?.matchKind).toBe("directory-prefix");
            expect(entry?.primaryConstruct).toBe("agent");
            expect(entry?.secondaryConstructs).toContain("instruction");
            expect(entry?.lintTarget).toBe("agents");
            expect(entry?.instructionFormat).toBe("copilot-agent");
        });
    });

    describe("when encoding hook lint exact paths", () => {
        it("should include copilot and claude hook config files", () => {
            // Arrange
            const expected = [
                {
                    path: ".github/hooks/agent-shell/hooks.json",
                    platform: "copilot",
                },
                { path: ".claude/settings.json", platform: "claude" },
                { path: ".claude/settings.local.json", platform: "claude" },
            ] as const;

            // Act / Assert
            for (const { path, platform } of expected) {
                const entry = findByPath(path);
                expect(entry).toBeDefined();
                expect(entry?.matchKind).toBe("exact");
                expect(entry?.primaryConstruct).toBe("hook");
                expect(entry?.lintTarget).toBe("hooks");
                expect(entry?.hookPlatform).toBe(platform);
            }
        });
    });

    describe("when encoding instruction lint locations", () => {
        it("should include all instruction formats with correct paths", () => {
            // Arrange
            const expected = [
                {
                    path: ".github/copilot-instructions.md",
                    matchKind: "exact",
                    format: "copilot-instructions",
                },
                {
                    path: ".github/instructions",
                    matchKind: "directory-prefix",
                    format: "copilot-scoped",
                },
                {
                    path: "AGENTS.md",
                    matchKind: "exact",
                    format: "agents-md",
                },
                {
                    path: "CLAUDE.md",
                    matchKind: "exact",
                    format: "claude-md",
                },
            ] as const;

            // Act / Assert
            for (const { path, matchKind, format } of expected) {
                const entry = findByPath(path);
                expect(entry).toBeDefined();
                expect(entry?.matchKind).toBe(matchKind);
                expect(entry?.primaryConstruct).toBe("instruction");
                expect(entry?.lintTarget).toBe("instructions");
                expect(entry?.instructionFormat).toBe(format);
            }
        });
    });

    describe("when encoding doctor-only construct locations", () => {
        it("should map known doctor path prefixes to construct types", () => {
            // Arrange
            const doctorOnly: ReadonlyArray<{
                path: string;
                construct: AgenticLocationEntry["primaryConstruct"];
            }> = [
                { path: ".github/hooks", construct: "hook" },
                { path: ".claude/hooks", construct: "hook" },
                { path: ".claude/commands", construct: "agent" },
                { path: ".codex-plugin", construct: "plugin" },
            ];

            // Act / Assert
            for (const { path, construct } of doctorOnly) {
                const entry = findByPath(path);
                expect(entry).toBeDefined();
                expect(entry?.matchKind).toBe("directory-prefix");
                expect(entry?.primaryConstruct).toBe(construct);
                expect(entry?.lintTarget).toBe("none");
            }
        });
    });

    describe("when encoding lint-mapped skill and subagent locations", () => {
        it("should map .pi/skills and .pi/prompts to skill lint targets", () => {
            // Arrange
            const piRoots: ReadonlyArray<{
                path: string;
            }> = [{ path: ".pi/skills" }, { path: ".pi/prompts" }];

            // Act / Assert
            for (const { path } of piRoots) {
                const entry = findByPath(path);
                expect(entry).toBeDefined();
                expect(entry?.matchKind).toBe("directory-prefix");
                expect(entry?.primaryConstruct).toBe("skill");
                expect(entry?.lintTarget).toBe("skills");
            }
        });

        it("should map .claude/agents to the subagents lint target", () => {
            // Act
            const entry = findByPath(".claude/agents");

            // Assert
            expect(entry).toBeDefined();
            expect(entry?.matchKind).toBe("directory-prefix");
            expect(entry?.primaryConstruct).toBe("subagent");
            expect(entry?.lintTarget).toBe("subagents");
        });
    });

    describe("when storing catalog paths", () => {
        it("should use forward slashes without trailing slashes", () => {
            // Act / Assert
            for (const entry of AGENTIC_LOCATION_CATALOG) {
                expect(entry.path.includes("\\")).toBe(false);
                expect(entry.path.endsWith("/")).toBe(false);
                expect(entry.path.startsWith("./")).toBe(false);
            }
        });

        it("should assign a unique id to every entry", () => {
            // Arrange
            const ids = AGENTIC_LOCATION_CATALOG.map((entry) => entry.id);

            // Assert
            expect(new Set(ids).size).toBe(ids.length);
        });

        it("should assign a unique path to every entry", () => {
            // Arrange
            const paths = AGENTIC_LOCATION_CATALOG.map((entry) => entry.path);

            // Act
            const uniquePaths = new Set(paths);

            // Assert
            expect(uniquePaths.size).toBe(paths.length);
        });
    });
});
