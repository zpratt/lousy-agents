import type { ArchetypeClassification } from "../entities/archetype.js";
import type { InventoryRecord } from "../entities/edge-types.js";

export interface AmbiguityQuestion {
    id: string;
    question: string;
    hint: string;
}

export function detectAmbiguities(
    records: InventoryRecord[],
    classification: ArchetypeClassification,
): AmbiguityQuestion[] {
    const questions: AmbiguityQuestion[] = [];

    if (classification.archetype === "accidental-sprawl") {
        const harnesses = [...new Set(records.map((r) => r.harness))].filter(
            (h) => h !== "shared",
        );
        if (harnesses.length > 1) {
            questions.push({
                id: "intended-multi-harness",
                question: `Multiple AI harnesses are configured (${harnesses.join(", ")}). Is this intentional?`,
                hint: "Answer 'yes' if you want multiple harnesses to work together. Answer 'no' if this is legacy configuration.",
            });
        }
    }

    if (classification.archetype === "intentional-hybrid") {
        const pathToHarness = new Map(records.map((r) => [r.path, r.harness]));
        const hasCrossHarnessImports = records.some((r) =>
            r.edges.some(
                (e) =>
                    !e.malformed &&
                    e.type === "hard-import" &&
                    typeof e.direction.to === "string" &&
                    pathToHarness.has(e.direction.to) &&
                    pathToHarness.get(e.direction.to) !== r.harness,
            ),
        );
        if (hasCrossHarnessImports) {
            questions.push({
                id: "hard-import-intentional",
                question:
                    "Claude hard-imports (@path) are referencing instruction files from other harnesses. Is this intentional?",
                hint: "Hard imports cause Claude to inline the file contents at runtime.",
            });
        }
    }

    return questions;
}
