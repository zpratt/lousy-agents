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
import {
    type DiscoveryDepthLimit,
    type DiscoveryDirectoryLimit,
    type DiscoveryEntryLimit,
    discoveryLimitFindings,
} from "./discovery-limit-finding.js";
import { evaluate } from "./evaluate-engine.js";

export interface LoadedIntent {
    intent: DeclaredIntentArtifact | null;
    report: IntentLoadReport;
}

export interface RepositoryScan {
    records: InventoryRecord[];
    /** Present when the scan stopped at its directory limit, so records may be missing */
    directoryLimit?: DiscoveryDirectoryLimit;
    /** Present when the scan left directories below its depth limit unentered */
    depthLimit?: DiscoveryDepthLimit;
    /** Present when the scan stopped at its entry budget, so records may be missing */
    entryLimit?: DiscoveryEntryLimit;
}

export interface DoctorRunPorts {
    scanRepository(repoPath: string): Promise<RepositoryScan>;
    readIntent(repoPath: string): Promise<LoadedIntent>;
    loadSnapshotRef(repoPath: string): Promise<string | undefined>;
    elicitIntent?(questions: AmbiguityQuestion[]): Promise<void>;
}

export interface DoctorRunInput {
    repoPath: string;
    summaryOnly: boolean;
}

interface DoctorRunBase {
    records: InventoryRecord[];
    classification: ArchetypeClassification;
    /**
     * Advisory notes about the scan itself, such as stopping at the directory
     * limit. They are present on every kind of run and never block a run.
     */
    scanWarnings: Finding[];
    snapshotRef?: string;
}

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
    return ports.readIntent(repoPath);
}

/**
 * A step after the scan failed. It keeps the scan warnings, so a caller can
 * still say that the scan was cut short before it reports the failure, and
 * the original error as `cause`.
 */
export class DoctorRunFailure extends Error {
    readonly scanWarnings: Finding[];

    constructor(cause: unknown, scanWarnings: Finding[]) {
        super(cause instanceof Error ? cause.message : String(cause), {
            cause,
        });
        this.name = "DoctorRunFailure";
        this.scanWarnings = scanWarnings;
    }
}

async function completeRun(
    input: DoctorRunInput,
    ports: DoctorRunPorts,
    base: DoctorRunBase,
): Promise<DoctorRun> {
    const { records, classification } = base;
    const snapshotRef = await ports.loadSnapshotRef(input.repoPath);
    const withSnapshot = {
        ...base,
        ...(snapshotRef !== undefined ? { snapshotRef } : {}),
    };

    if (input.summaryOnly) {
        return { kind: "summary", ...withSnapshot };
    }
    if (classification.archetype === "none") {
        return { kind: "no-constructs", ...withSnapshot };
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
    return {
        kind: "evaluated",
        ...withSnapshot,
        findings,
        intentLoad: loaded.report,
    };
}

export async function runDoctor(
    input: DoctorRunInput,
    ports: DoctorRunPorts,
): Promise<DoctorRun> {
    const scan = await ports.scanRepository(input.repoPath);
    const base: DoctorRunBase = {
        records: scan.records,
        classification: classifyArchetype(scan.records),
        scanWarnings: discoveryLimitFindings(
            scan.directoryLimit,
            scan.depthLimit,
            scan.entryLimit,
        ),
    };
    try {
        return await completeRun(input, ports, base);
    } catch (error: unknown) {
        throw new DoctorRunFailure(error, base.scanWarnings);
    }
}
