import { describe, expect, it } from "vitest";
import type { HarnessName } from "./edge-types.js";
import {
    getFootprint,
    HARNESS_FOOTPRINTS,
    HARNESS_NAMES,
} from "./harness-footprints.js";

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
