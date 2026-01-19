/**
 * Use case for building setup step candidates from environment detection.
 * This module handles the logic of determining which GitHub Actions
 * setup steps should be added based on detected version files.
 */

import type {
    DetectedEnvironment,
    SetupStepCandidate,
    VersionFile,
    VersionFileType,
} from "../entities/copilot-setup.js";
import type { ActionVersionGateway } from "../gateways/action-version-gateway.js";
import { createActionVersionGateway } from "../gateways/action-version-gateway.js";
import {
    type CopilotSetupConfig,
    getVersionFileConfigKeyMap,
    getVersionTypeToActionMap,
    loadCopilotSetupConfig,
} from "../lib/copilot-setup-config.js";

/**
 * Builds setup step candidates from detected environment
 * @param environment The detected environment configuration
 * @param versionGateway Optional gateway for looking up action versions (defaults to local)
 * @param config Optional copilot-setup configuration
 * @returns Array of setup step candidates
 */
export async function buildCandidatesFromEnvironment(
    environment: DetectedEnvironment,
    versionGateway: ActionVersionGateway = createActionVersionGateway(),
    config?: CopilotSetupConfig,
): Promise<SetupStepCandidate[]> {
    const loadedConfig = config || (await loadCopilotSetupConfig());
    const versionTypeToAction = getVersionTypeToActionMap(loadedConfig);
    const versionFileConfigKeys = getVersionFileConfigKeyMap(loadedConfig);

    const candidates: SetupStepCandidate[] = [];

    // If mise.toml is present, add mise-action only
    if (environment.hasMise) {
        const miseVersion = await versionGateway.getVersion("jdx/mise-action");
        candidates.push({
            action: "jdx/mise-action",
            version: miseVersion,
            source: "version-file",
        });
        return candidates;
    }

    // Otherwise, add individual setup actions for each version file
    return buildCandidatesFromVersionFiles(
        environment.versionFiles,
        versionTypeToAction,
        versionFileConfigKeys,
        versionGateway,
    );
}

/**
 * Builds setup step candidates from individual version files
 * @param versionFiles Array of version files to process
 * @param versionTypeToAction Map from version file type to action name
 * @param versionFileConfigKeys Map from version file type to config key
 * @param versionGateway Gateway for looking up action versions
 * @returns Array of setup step candidates
 */
async function buildCandidatesFromVersionFiles(
    versionFiles: VersionFile[],
    versionTypeToAction: Partial<Record<VersionFileType, string>>,
    versionFileConfigKeys: Partial<Record<VersionFileType, string>>,
    versionGateway: ActionVersionGateway,
): Promise<SetupStepCandidate[]> {
    const candidates: SetupStepCandidate[] = [];
    // Track which types we've already added to deduplicate (e.g., .nvmrc and .node-version)
    const addedTypes = new Set<VersionFileType>();

    for (const versionFile of versionFiles) {
        if (addedTypes.has(versionFile.type)) {
            continue;
        }
        addedTypes.add(versionFile.type);

        const action = versionTypeToAction[versionFile.type];
        const configKey = versionFileConfigKeys[versionFile.type];

        if (!action || !configKey) {
            continue;
        }

        const version = await versionGateway.getVersion(action);

        candidates.push({
            action,
            version,
            config: {
                [configKey]: versionFile.filename,
            },
            source: "version-file",
        });
    }

    return candidates;
}
