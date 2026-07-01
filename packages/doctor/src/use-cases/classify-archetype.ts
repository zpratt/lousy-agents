import type {
    Archetype,
    ArchetypeClassification,
} from "../entities/archetype.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import { HARNESS_FOOTPRINTS } from "../entities/harness-footprints.js";
import {
    buildHarnessProfiles,
    PURE_DOMINANCE_THRESHOLD,
} from "./harness-profile.js";

export type { Archetype, ArchetypeClassification };

function hasCrossHarnessEdges(records: InventoryRecord[]): boolean {
    const harnessByPath = new Map<string, string>();
    for (const record of records) {
        harnessByPath.set(record.path, record.harness);
    }

    for (const record of records) {
        for (const edge of record.edges) {
            if (
                edge.malformed ||
                edge.type === "glob-binding" ||
                typeof edge.direction.to !== "string"
            ) {
                continue;
            }
            const targetHarness = harnessByPath.get(edge.direction.to);
            if (targetHarness && targetHarness !== record.harness) {
                return true;
            }
        }
    }
    return false;
}

export function classifyArchetype(
    records: InventoryRecord[],
): ArchetypeClassification {
    if (records.length === 0) {
        return { archetype: "none", dominanceScore: 0, ambiguities: [] };
    }

    const profiles = buildHarnessProfiles(records);
    const distinctHarnesses = new Set(records.map((r) => r.harness));

    if (distinctHarnesses.size === 1 && distinctHarnesses.has("shared")) {
        return {
            archetype: "canonical-contract",
            dominanceScore: 1,
            ambiguities: [],
        };
    }

    const nonSharedHarnesses = [...distinctHarnesses].filter(
        (h) => h !== "shared",
    );

    const needsVerificationHarnesses = nonSharedHarnesses.filter(
        (h) =>
            HARNESS_FOOTPRINTS[h as keyof typeof HARNESS_FOOTPRINTS].status ===
            "needs-verification",
    );
    const ambiguities = needsVerificationHarnesses.map(
        (h) => `harness '${h}' detection patterns are not fully verified`,
    );

    // If all non-shared harnesses need verification, the archetype is ambiguous
    if (
        nonSharedHarnesses.length > 0 &&
        needsVerificationHarnesses.length === nonSharedHarnesses.length
    ) {
        const topProfile = profiles.reduce((a, b) =>
            a.share > b.share ? a : b,
        );
        return {
            archetype: "ambiguous",
            dominanceScore: topProfile.share,
            ambiguities,
        };
    }

    // pure: single dominant harness with no cross-harness edges
    if (nonSharedHarnesses.length === 1) {
        const dominant = profiles.find(
            (p) => p.harness === nonSharedHarnesses[0],
        );
        const score = dominant?.share ?? 1;
        if (
            score >= PURE_DOMINANCE_THRESHOLD &&
            !hasCrossHarnessEdges(records)
        ) {
            return {
                archetype: "pure",
                dominanceScore: score,
                ambiguities,
            };
        }
    }

    const crossHarness = hasCrossHarnessEdges(records);
    const topProfile = profiles.reduce((a, b) => (a.share > b.share ? a : b));

    if (crossHarness) {
        return {
            archetype: "intentional-hybrid",
            dominanceScore: topProfile.share,
            ambiguities,
        };
    }

    // ambiguous when needs-verification harnesses are present alongside verified ones
    if (ambiguities.length > 0) {
        return {
            archetype: "ambiguous",
            dominanceScore: topProfile.share,
            ambiguities,
        };
    }

    return {
        archetype: "accidental-sprawl",
        dominanceScore: topProfile.share,
        ambiguities,
    };
}
