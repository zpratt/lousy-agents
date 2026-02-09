/**
 * Use case for building setup step candidates from environment detection.
 * This module handles the logic of determining which GitHub Actions
 * setup steps should be added based on detected version files and package managers.
 */

import type {
    DetectedEnvironment,
    PackageManagerFile,
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
    const setupCandidates = await buildCandidatesFromVersionFiles(
        environment.versionFiles,
        versionTypeToAction,
        versionFileConfigKeys,
        versionGateway,
    );
    candidates.push(...setupCandidates);

    // Add install steps for detected package managers
    const installCandidates = buildInstallCandidatesFromPackageManagers(
        environment.packageManagers,
        loadedConfig,
    );
    candidates.push(...installCandidates);

    return candidates;
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

/**
 * Builds install step candidates from detected package managers
 * @param packageManagers Array of detected package managers
 * @param config Configuration for package manager mappings
 * @returns Array of install step candidates
 */
function buildInstallCandidatesFromPackageManagers(
    packageManagers: PackageManagerFile[],
    config: CopilotSetupConfig,
): SetupStepCandidate[] {
    const candidates: SetupStepCandidate[] = [];
    const addedTypes = new Set<string>();

    for (const pm of packageManagers) {
        // Skip if we've already added this package manager type
        if (addedTypes.has(pm.type)) {
            continue;
        }
        addedTypes.add(pm.type);

        // Find the config for this package manager
        const pmConfig = config.packageManagers.find((c) => c.type === pm.type);
        if (!pmConfig) {
            continue;
        }

        // Determine a descriptive name for the install step
        const stepName = getInstallStepName(pm.type);

        // Create install step candidate
        candidates.push({
            action: "", // Empty action means this is a run step
            source: "version-file",
            name: stepName,
            run: pmConfig.installCommand,
        });
    }

    return candidates;
}

/**
 * Gets a descriptive name for an install step based on package manager type
 */
function getInstallStepName(packageManagerType: string): string {
    const names: Record<string, string> = {
        npm: "Install Node.js dependencies",
        yarn: "Install Node.js dependencies",
        pnpm: "Install Node.js dependencies",
        pip: "Install Python dependencies",
        pipenv: "Install Python dependencies",
        poetry: "Install Python dependencies",
        bundler: "Install Ruby dependencies",
        cargo: "Build Rust project",
        composer: "Install PHP dependencies",
        maven: "Install Java dependencies",
        gradle: "Build Gradle project",
        gomod: "Download Go dependencies",
        pub: "Install Dart dependencies",
        nuget: "Restore .NET dependencies",
    };
    return names[packageManagerType] || "Install dependencies";
}
