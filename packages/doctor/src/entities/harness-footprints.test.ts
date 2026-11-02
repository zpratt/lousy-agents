import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { HarnessName } from "./edge-types.js";
import {
    determineHarness,
    getFootprint,
    HARNESS_FOOTPRINTS,
    HARNESS_NAMES,
} from "./harness-footprints.js";

const chance = new Chance();

describe("HARNESS_NAMES", () => {
    it("should export exactly seven active harness names", () => {
        expect(HARNESS_NAMES).toHaveLength(7);
    });

    it("should not include 'shared'", () => {
        expect(HARNESS_NAMES).not.toContain("shared");
    });

    it("should contain all seven supported harnesses", () => {
        const expected: HarnessName[] = [
            "claude",
            "copilot",
            "codex",
            "antigravity",
            "hermes",
            "crush",
            "pi",
        ];
        for (const harness of expected) {
            expect(HARNESS_NAMES).toContain(harness);
        }
    });
});

describe("HARNESS_FOOTPRINTS", () => {
    it("should have an entry for every harness in HARNESS_NAMES", () => {
        for (const name of HARNESS_NAMES) {
            expect(HARNESS_FOOTPRINTS[name]).toBeDefined();
        }
    });

    it("should assign a status of 'verified' or 'needs-verification' to every footprint", () => {
        for (const name of HARNESS_NAMES) {
            const footprint = HARNESS_FOOTPRINTS[name];
            expect(["verified", "needs-verification"]).toContain(
                footprint.status,
            );
        }
    });

    it("should map each cross-reference mechanism to exactly one edge type", () => {
        const validEdgeTypes = new Set([
            "hard-import",
            "soft-reference",
            "glob-binding",
        ]);
        for (const name of HARNESS_NAMES) {
            const footprint = HARNESS_FOOTPRINTS[name];
            for (const mechanism of footprint.crossRefMechanisms) {
                expect(validEdgeTypes).toContain(mechanism.edgeType);
            }
        }
    });

    describe("when harness reads AGENTS.md by convention", () => {
        it("should set readsAgentsMd: true for codex", () => {
            expect(HARNESS_FOOTPRINTS.codex.readsAgentsMd).toBe(true);
        });

        it("should set readsAgentsMd: true for hermes", () => {
            expect(HARNESS_FOOTPRINTS.hermes.readsAgentsMd).toBe(true);
        });

        it("should set readsAgentsMd: true for crush", () => {
            expect(HARNESS_FOOTPRINTS.crush.readsAgentsMd).toBe(true);
        });

        it("should set readsAgentsMd: true for pi", () => {
            expect(HARNESS_FOOTPRINTS.pi.readsAgentsMd).toBe(true);
        });
    });

    describe("when harness reads AGENTS.md by convention, in the entries not named above", () => {
        it("should set readsAgentsMd: false for antigravity", () => {
            expect(HARNESS_FOOTPRINTS.antigravity.readsAgentsMd).toBe(false);
        });

        it("should set readsAgentsMd: true for the shared entry", () => {
            expect(HARNESS_FOOTPRINTS.shared.readsAgentsMd).toBe(true);
        });
    });

    describe("when harness reads AGENTS.md only under a condition", () => {
        // Corrected from false: Copilot reads AGENTS.md (GitHub docs: custom
        // instructions support), and Claude Code reads it when no CLAUDE.md,
        // .claude/CLAUDE.md or CLAUDE.local.md exists at or above the working
        // directory, on Claude Code 2.1.277 or later (Claude Code docs: memory).
        it("should set readsAgentsMd: true for copilot, which reads AGENTS.md", () => {
            expect(HARNESS_FOOTPRINTS.copilot.readsAgentsMd).toBe(true);
        });

        it("should set readsAgentsMd: true for claude, which reads AGENTS.md when there is no CLAUDE file", () => {
            expect(HARNESS_FOOTPRINTS.claude.readsAgentsMd).toBe(true);
        });
    });

    describe("pi harness walk boundary", () => {
        it("should document that pi has no git boundary (walks to filesystem root)", () => {
            expect(HARNESS_FOOTPRINTS.pi.walkBoundary).toBe("filesystem-root");
        });
    });

    describe("codex harness walk boundary", () => {
        it("should document that codex stops at git root", () => {
            expect(HARNESS_FOOTPRINTS.codex.walkBoundary).toBe("git-root");
        });
    });

    describe("antigravity/gemini harness", () => {
        it("should be marked needs-verification", () => {
            expect(HARNESS_FOOTPRINTS.antigravity.status).toBe(
                "needs-verification",
            );
        });
    });

    describe("copilot harness root-only convention files", () => {
        it("should document that Copilot also loads CLAUDE.md and GEMINI.md, but only from the repo root", () => {
            expect(HARNESS_FOOTPRINTS.copilot.rootOnlyConventionFiles).toEqual(
                expect.arrayContaining(["CLAUDE.md", "GEMINI.md"]),
            );
        });
    });

    describe("copilot harness primary indicators for skills, agents, and hooks", () => {
        it("should include .github/skills/, .github/agents/, and .github/hooks/ so those paths resolve to the copilot harness", () => {
            expect(HARNESS_FOOTPRINTS.copilot.primaryIndicators).toEqual(
                expect.arrayContaining([
                    ".github/skills/",
                    ".github/agents/",
                    ".github/hooks/",
                ]),
            );
        });
    });
});

describe("getFootprint", () => {
    it("should return the footprint for a given harness name", () => {
        const footprint = getFootprint("claude");
        expect(footprint.name).toBe("claude");
    });

    it("should return footprints with non-empty conventionFiles lists for harnesses that have them", () => {
        const claude = getFootprint("claude");
        expect(claude.conventionFiles.length).toBeGreaterThan(0);
    });
});

describe("determineHarness", () => {
    it.each([
        ["CLAUDE.md", "claude"],
        [".github/copilot-instructions.md", "copilot"],
        ["GEMINI.md", "antigravity"],
        ["AGENTS.override.md", "codex"],
        ["AGENTS.md", "shared"],
    ] as const)(
        "should resolve the convention file %s to the %s harness",
        (path, expected) => {
            const harness = determineHarness(path);

            expect(harness).toBe(expected);
        },
    );

    it.each([
        [".claude/", "claude"],
        [".github/instructions/", "copilot"],
        [".codex/", "codex"],
    ] as const)(
        "should resolve any file under %s to the %s harness",
        (directory, expected) => {
            const path = `${directory}${chance.word()}/${chance.word()}.md`;

            const harness = determineHarness(path);

            expect(harness).toBe(expected);
        },
    );

    it("should normalize backslash separators before matching", () => {
        const path = `.claude\\${chance.word()}.json`;

        const harness = determineHarness(path);

        expect(harness).toBe("claude");
    });

    it("should return null for a path no harness claims", () => {
        const path = `src/${chance.word()}.ts`;

        const harness = determineHarness(path);

        expect(harness).toBeNull();
    });

    describe("when more than one harness claims the path", () => {
        it("should resolve the path to the shared harness", () => {
            const contestedPath = `${chance.word()}.md`;
            const overlappingFootprints = {
                ...HARNESS_FOOTPRINTS,
                claude: {
                    ...HARNESS_FOOTPRINTS.claude,
                    primaryIndicators: [contestedPath],
                },
                copilot: {
                    ...HARNESS_FOOTPRINTS.copilot,
                    primaryIndicators: [contestedPath],
                },
            };

            const harness = determineHarness(
                contestedPath,
                overlappingFootprints,
            );

            expect(harness).toBe("shared");
        });
    });
});
