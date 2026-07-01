export type Archetype =
    | "pure"
    | "intentional-hybrid"
    | "canonical-contract"
    | "accidental-sprawl"
    | "none"
    | "ambiguous";

export interface ArchetypeClassification {
    archetype: Archetype;
    dominanceScore: number;
    ambiguities: string[];
}
