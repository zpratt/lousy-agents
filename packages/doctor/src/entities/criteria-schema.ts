import type { Archetype } from "./archetype.js";
import type {
    EdgeMalformedReason,
    FindingCategory,
    HarnessName,
} from "./edge-types.js";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Classification = "defect" | "advisory" | "info";

export type CheckMethod =
    | "inventory.fileExists"
    | "inventory.edgePresent"
    | "inventory.externalImport"
    | "inventory.edgeDirection"
    | "inventory.edgeDirectionExists"
    | "inventory.archetypeIs"
    | "intent.capabilityDeclared"
    | "intent.artifactRejected"
    | "intent.artifactAbsent";

export interface FileExistsArgs {
    harness: HarnessName;
    paths: readonly string[];
}

export interface EdgePresentArgs {
    fromHarness: HarnessName;
    toHarness: HarnessName;
    edgeType?: "hard-import" | "soft-reference" | "glob-binding";
    /**
     * Count only malformed edges with one of these reasons. An edge with no
     * reason counts as "missing-target". Omit to count every malformed edge.
     */
    malformedReasons?: readonly EdgeMalformedReason[];
}

/** Reports each Claude hard-import that resolves outside the working directory. */
export interface ExternalImportArgs {
    fromHarness: HarnessName;
}

export interface CapabilityDeclaredArgs {
    capability: string;
}

export type ArchetypeIsArgs = Record<string, never>;

export type CheckMethodArgs =
    | FileExistsArgs
    | EdgePresentArgs
    | ExternalImportArgs
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
