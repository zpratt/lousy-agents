import { resolve } from "node:path";
import type { ConsolaInstance } from "consola";
import type { DoctorRunPorts } from "../use-cases/run-doctor.js";
import { readIntentArtifact } from "./intent-artifact.js";
import { scanRepository } from "./scanner.js";
import {
    createWisdomClient,
    type WisdomClient,
    WisdomUnavailableError,
} from "./wisdom-client.js";

/** The only part of a wisdom client the doctor gateways use. */
export type WisdomGraphReader = Pick<WisdomClient, "getGraph">;

export interface DoctorGatewayDependencies {
    createWisdomClient(wisdomDir: string): WisdomGraphReader;
}

const DEFAULT_DEPENDENCIES: DoctorGatewayDependencies = { createWisdomClient };

export function createDoctorGateways(
    logger: ConsolaInstance,
    dependencies: DoctorGatewayDependencies = DEFAULT_DEPENDENCIES,
): Omit<DoctorRunPorts, "elicitIntent"> {
    return {
        scanRepository,
        async readIntent(repoPath) {
            const result = await readIntentArtifact(repoPath);
            return {
                intent: result.found ? result.artifact : null,
                report: result.report,
            };
        },
        async loadSnapshotRef(repoPath) {
            try {
                const graph = await dependencies
                    .createWisdomClient(resolve(repoPath, "wisdom"))
                    .getGraph();
                return graph.snapshotRef;
            } catch (error: unknown) {
                if (!(error instanceof WisdomUnavailableError)) throw error;
                logger.debug(
                    "Wisdom graph unavailable — snapshotRef will be omitted",
                );
                return undefined;
            }
        },
    };
}
