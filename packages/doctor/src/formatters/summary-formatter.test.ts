import { describe, expect, it } from "vitest";
import type { ArchetypeClassification } from "../entities/archetype.js";
import type { HarnessName, InventoryRecord } from "../entities/edge-types.js";
import { formatSummary } from "./summary-formatter.js";

function record(harness: HarnessName, path: string): InventoryRecord {
    return {
        id: `${harness}:${path}`,
        path,
        harness,
        constructType: "instruction",
        loadMechanism: "convention-loaded",
        edges: [],
    };
}

const classification: ArchetypeClassification = {
    archetype: "intentional-hybrid",
    dominanceScore: 0.5,
    ambiguities: [],
};

describe("formatSummary", () => {
    describe("when records come from several harnesses", () => {
        it("should list the harness breakdown in harness-name order", () => {
            const records = [
                record("shared", "AGENTS.md"),
                record("copilot", ".github/copilot-instructions.md"),
                record("claude", "CLAUDE.md"),
                record("codex", "AGENTS.override.md"),
            ];

            const summary = formatSummary(records, classification);

            expect(
                summary.harnessBreakdown.map((entry) => entry.harness),
            ).toEqual(["claude", "codex", "copilot", "shared"]);
        });
    });
});
