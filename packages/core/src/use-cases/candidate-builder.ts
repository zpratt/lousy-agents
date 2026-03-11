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
import {
    type CopilotSetupConfig,
    DEFAULT_COPILOT_SETUP_CONFIG,
} from "../entities/copilot-setup-config.js";
import {
    getVersionFileConfigKeyMap,
    getVersionTypeToActionMap,
} from "../lib/copilot-setup-config.js";

/**
 * Port for action version lookup.
 */
export interface ActionVersionPort {
    getVersion(actionName: string): Promise<string | undefined>;
}

/**
 * Creates an ActionVersionPort backed by a static version map.
 */
export function createActionVersionPort(
    versionMap: Record<string, string>,
): ActionVersionPort {
    return {
        async getVersion(actionName: string): Promise<string | undefined> {
            return versionMap[actionName];
        },
    };
}

const DEFAULT_ACTION_VERSIONS: Record<string, string> = {
    "actions/setup-node": "v4",
    "actions/setup-python": "v5",
    "actions/setup-java": "v4",
    "actions/setup-ruby": "v1",
    "actions/setup-go": "v5",
    "jdx/mise-action": "v2",
};

const defaultActionVersionPort = createActionVersionPort(
    DEFAULT_ACTION_VERSIONS,
);

/**
 * Builds setup step candidates from detected environment.
 */
export async function buildCandidatesFromEnvironment(
    environment: DetectedEnvironment,
    versionGateway: ActionVersionPort = defaultActionVersionPort,
    config: CopilotSetupConfig = DEFAULT_COPILOT_SETUP_CONFIG,
): Promise<SetupStepCandidate[]> {
    const versionTypeToAction = getVersionTypeToActionMap(config);
    const versionFileConfigKeys = getVersionFileConfigKeyMap(config);

    const candidates: SetupStepCandidate[] = [];

    if (environment.hasMise) {
        const miseVersion = await versionGateway.getVersion("jdx/mise-action");
        candidates.push({
            action: "jdx/mise-action",
            version: miseVersion,
            source: "version-file",
        });
        return candidates;
    }

    const setupCandidates = await buildCandidatesFromVersionFiles(
        environment.versionFiles,
        versionTypeToAction,
        versionFileConfigKeys,
        versionGateway,
    );
    candidates.push(...setupCandidates);

    const installCandidates = buildInstallCandidatesFromPackageManagers(
        environment.packageManagers,
        config,
    );
    candidates.push(...installCandidates);

    return candidates;
}

async function buildCandidatesFromVersionFiles(
    versionFiles: VersionFile[],
    versionTypeToAction: Partial<Record<VersionFileType, string>>,
    versionFileConfigKeys: Partial<Record<VersionFileType, string>>,
    versionGateway: ActionVersionPort,
): Promise<SetupStepCandidate[]> {
    const candidates: SetupStepCandidate[] = [];
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

function buildInstallCandidatesFromPackageManagers(
    packageManagers: PackageManagerFile[],
    config: CopilotSetupConfig,
): SetupStepCandidate[] {
    const candidates: SetupStepCandidate[] = [];
    const addedTypes = new Set<string>();

    for (const pm of packageManagers) {
        if (addedTypes.has(pm.type)) {
            continue;
        }
        addedTypes.add(pm.type);

        const pmConfig = config.packageManagers.find((c) => c.type === pm.type);
        if (!pmConfig) {
            continue;
        }

        const stepName = getInstallStepName(pm.type);

        candidates.push({
            action: "",
            source: "version-file",
            name: stepName,
            run: pmConfig.installCommand,
        });
    }

    return candidates;
}

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
    };
    return names[packageManagerType] || "Install dependencies";
}
