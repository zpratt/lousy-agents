import type { ArchetypeClassification } from "../entities/archetype.js";
import type { DeclaredIntentArtifact } from "../entities/declared-intent.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import type { Finding } from "../entities/finding.js";
import type { IntentLoadReport } from "../entities/intent-load.js";
import { classifyArchetype } from "./classify-archetype.js";
import { CRITERIA } from "./criteria.js";
import {
    type AmbiguityQuestion,
    detectAmbiguities,
} from "./detect-ambiguities.js";
import { evaluate } from "./evaluate-engine.js";

export interface LoadedIntent {
    intent: DeclaredIntentArtifact | null;
    report: IntentLoadReport;
}

/** Ports for the doctor run; concrete gateways are wired by the caller. */
export interface DoctorRunPorts {
    scanRepository(repoPath: string): Promise<InventoryRecord[]>;
    readIntent(repoPath: string): Promise<LoadedIntent>;
    loadSnapshotRef(repoPath: string): Promise<string | undefined>;
    /** Present only when the caller may interact with the user. */
    elicitIntent?(questions: AmbiguityQuestion[]): Promise<void>;
}

export interface DoctorRunInput {
    repoPath: string;
    summaryOnly: boolean;
}

interface DoctorRunBase {
    records: InventoryRecord[];
    classification: ArchetypeClassification;
    snapshotRef?: string;
}

/**
 * Explicit run outcome. Only `evaluated` carries findings, so no output path
 * can mistake a skipped evaluation for a clean one.
 */
export type DoctorRun =
    | (DoctorRunBase & { kind: "summary" })
    | (DoctorRunBase & { kind: "no-constructs" })
    | (DoctorRunBase & {
          kind: "evaluated";
          findings: Finding[];
          intentLoad: IntentLoadReport;
      });

async function loadIntent(
    repoPath: string,
    records: InventoryRecord[],
    classification: ArchetypeClassification,
    ports: DoctorRunPorts,
): Promise<LoadedIntent> {
    const loaded = await ports.readIntent(repoPath);
    if (loaded.report.status !== "absent" || !ports.elicitIntent) {
        return loaded;
    }
    const questions = detectAmbiguities(records, classification);
    if (questions.length === 0) {
        return loaded;
    }
    await ports.elicitIntent(questions);
    // The user may have created the file in another terminal while answering.
    return ports.readIntent(repoPath);
}

export async function runDoctor(
    input: DoctorRunInput,
    ports: DoctorRunPorts,
): Promise<DoctorRun> {
    const records = await ports.scanRepository(input.repoPath);
    const classification = classifyArchetype(records);
    const snapshotRef = await ports.loadSnapshotRef(input.repoPath);
    const base = {
        records,
        classification,
        ...(snapshotRef !== undefined ? { snapshotRef } : {}),
    };

    if (input.summaryOnly) {
        return { kind: "summary", ...base };
    }
    if (classification.archetype === "none") {
        return { kind: "no-constructs", ...base };
    }

    const loaded = await loadIntent(
        input.repoPath,
        records,
        classification,
        ports,
    );
    const findings = evaluate(CRITERIA, {
        records,
        classification,
        intent: loaded.intent,
        intentLoadStatus: loaded.report.status,
    });
    return { kind: "evaluated", ...base, findings, intentLoad: loaded.report };
}
