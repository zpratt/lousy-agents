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

    describe("when harness does not read AGENTS.md as primary convention", () => {
        it("should set readsAgentsMd: false for claude", () => {
            expect(HARNESS_FOOTPRINTS.claude.readsAgentsMd).toBe(false);
        });

        it("should set readsAgentsMd: false for copilot", () => {
            expect(HARNESS_FOOTPRINTS.copilot.readsAgentsMd).toBe(false);
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
            // Act
            const harness = determineHarness(path);

            // Assert
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
            // Arrange
            const path = `${directory}${chance.word()}/${chance.word()}.md`;

            // Act
            const harness = determineHarness(path);

            // Assert
            expect(harness).toBe(expected);
        },
    );

    it("should normalize backslash separators before matching", () => {
        // Arrange
        const path = `.claude\\${chance.word()}.json`;

        // Act
        const harness = determineHarness(path);

        // Assert
        expect(harness).toBe("claude");
    });

    it("should return null for a path no harness claims", () => {
        // Arrange
        const path = `src/${chance.word()}.ts`;

        // Act
        const harness = determineHarness(path);

        // Assert
        expect(harness).toBeNull();
    });

    describe("when more than one harness claims the path", () => {
        it("should resolve the path to the shared harness", () => {
            // Arrange
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

            // Act
            const harness = determineHarness(
                contestedPath,
                overlappingFootprints,
            );

            // Assert
            expect(harness).toBe("shared");
        });
    });
});
