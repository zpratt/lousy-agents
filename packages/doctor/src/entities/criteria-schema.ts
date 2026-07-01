import type { Archetype } from "./archetype.js";
import type { FindingCategory, HarnessName } from "./edge-types.js";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Classification = "defect" | "advisory" | "info";

export type CheckMethod =
    | "inventory.fileExists"
    | "inventory.edgePresent"
    | "inventory.edgeDirection"
    | "inventory.edgeDirectionExists"
    | "inventory.archetypeIs"
    | "inventory.constructPresent"
    | "intent.capabilityDeclared";

export interface FileExistsArgs {
    harness: HarnessName;
    paths: readonly string[];
}

export interface EdgePresentArgs {
    fromHarness: HarnessName;
    toHarness: HarnessName;
    edgeType?: "hard-import" | "soft-reference" | "glob-binding";
}

export interface ConstructPresentArgs {
    harness: HarnessName;
    constructType: string;
}

export interface CapabilityDeclaredArgs {
    capability: string;
}

export type ArchetypeIsArgs = Record<string, never>;

export type CheckMethodArgs =
    | FileExistsArgs
    | EdgePresentArgs
    | ConstructPresentArgs
    | CapabilityDeclaredArgs
    | ArchetypeIsArgs;

export interface Criterion {
    id: string;
    appliesToHarness: HarnessName | "all";
    appliesToArchetype?: Archetype | "all";
    severity: Severity;
    classification: Classification;
    capability?: string;
    precondition?: string;
    checkMethod: CheckMethod;
    checkArgs: CheckMethodArgs;
    category: FindingCategory;
    description: string;
}
