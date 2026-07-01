import type { Classification, Severity } from "./criteria-schema.js";
import type { FindingCategory } from "./edge-types.js";

export interface CitationHandle {
    nodeId: string;
    sourceFile: string;
    lineRange?: [number, number];
    snapshotRef?: string;
}

export interface Finding {
    id: string;
    criterionId: string;
    targetId: string;
    severity: Severity;
    category: FindingCategory;
    classification: Classification;
    intentGated: boolean;
    assumedIntent: boolean;
    description: string;
    evidenceCitation?: CitationHandle;
    snapshotRef?: string;
}
