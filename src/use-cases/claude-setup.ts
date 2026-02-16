/**
 * Use cases for Claude Code Web Environment Setup feature.
 * This module handles the logic of building SessionStart hooks from environment detection.
 */

import type {
    DetectedEnvironment,
    PackageManagerFile,
    VersionFile,
    VersionFileType,
} from "../entities/copilot-setup.js";
import type { SessionStartHook } from "../entities/claude-setup.js";
import {
    type CopilotSetupConfig,
    loadCopilotSetupConfig,
} from "../lib/copilot-setup-config.js";

/**
 * Builds SessionStart hooks from detected environment.
 * Transforms environment configuration into Claude Code SessionStart commands.
 *
 * @param environment The detected environment configuration
 * @param config Optional copilot-setup configuration (for package manager mappings)
 * @returns Array of SessionStart hooks
 */
export async function buildSessionStartHooks(
    environment: DetectedEnvironment,
    config?: CopilotSetupConfig,
): Promise<SessionStartHook[]> {
    const loadedConfig = config || (await loadCopilotSetupConfig());
    const hooks: SessionStartHook[] = [];

    // If mise.toml is present, add mise install
    if (environment.hasMise) {
        hooks.push({
            command: "mise install",
            description: "Install runtimes from mise.toml",
        });
        // After mise install, add package manager install hooks
        const packageManagerHooks = buildPackageManagerHooks(
            environment.packageManagers,
            loadedConfig,
        );
        hooks.push(...packageManagerHooks);
        return hooks;
    }

    // Otherwise, add runtime installation hooks for each version file
    const runtimeHooks = buildRuntimeHooks(environment.versionFiles);
    hooks.push(...runtimeHooks);

    // Add package manager install hooks
    const packageManagerHooks = buildPackageManagerHooks(
        environment.packageManagers,
        loadedConfig,
    );
    hooks.push(...packageManagerHooks);

    return hooks;
}

/**
 * Builds runtime installation hooks from version files.
 * Maps version files to appropriate runtime manager commands (nvm, pyenv, etc.)
 *
 * @param versionFiles Array of detected version files
 * @returns Array of runtime installation hooks
 */
function buildRuntimeHooks(versionFiles: VersionFile[]): SessionStartHook[] {
    const hooks: SessionStartHook[] = [];
    const addedTypes = new Set<VersionFileType>();

    for (const versionFile of versionFiles) {
        // Deduplicate by type (e.g., .nvmrc and .node-version both use nvm)
        if (addedTypes.has(versionFile.type)) {
            continue;
        }
        addedTypes.add(versionFile.type);

        const hook = getRuntimeHookForType(versionFile.type, versionFile);
        if (hook) {
            hooks.push(hook);
        }
    }

    return hooks;
}

/**
 * Gets the runtime installation hook for a specific version file type.
 *
 * @param type The version file type
 * @param versionFile The version file metadata
 * @returns SessionStart hook or null if not supported
 */
function getRuntimeHookForType(
    type: VersionFileType,
    versionFile: VersionFile,
): SessionStartHook | null {
    const versionInfo = versionFile.version
        ? ` (${versionFile.version})`
        : "";

    switch (type) {
        case "node":
            return {
                command: "nvm install",
                description: `Install Node.js from ${versionFile.filename}${versionInfo}`,
            };
        case "python":
            return {
                command: `pyenv install -s $(cat ${versionFile.filename})`,
                description: `Install Python from ${versionFile.filename}${versionInfo}`,
            };
        case "ruby":
            return {
                command: `rbenv install -s $(cat ${versionFile.filename})`,
                description: `Install Ruby from ${versionFile.filename}${versionInfo}`,
            };
        case "java":
            // Java version management in Claude Code base image may use sdkman or alternatives
            // For now, document but don't generate command as it's environment-specific
            return null;
        case "go":
            // Go version management typically handled by asdf or gvm
            // For now, document but don't generate command as it's environment-specific
            return null;
        default:
            return null;
    }
}

/**
 * Builds package manager installation hooks from detected package managers.
 *
 * @param packageManagers Array of detected package managers
 * @param config Configuration for package manager mappings
 * @returns Array of package manager installation hooks
 */
function buildPackageManagerHooks(
    packageManagers: PackageManagerFile[],
    config: CopilotSetupConfig,
): SessionStartHook[] {
    const hooks: SessionStartHook[] = [];
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

        const description = getPackageManagerDescription(pm.type, pm);

        hooks.push({
            command: pmConfig.installCommand,
            description,
        });
    }

    return hooks;
}

/**
 * Gets a descriptive description for a package manager hook.
 */
function getPackageManagerDescription(
    packageManagerType: string,
    pm: PackageManagerFile,
): string {
    const lockfileInfo = pm.lockfile ? ` with ${pm.lockfile}` : "";

    const descriptions: Record<string, string> = {
        npm: `Install Node.js dependencies${lockfileInfo}`,
        yarn: `Install Node.js dependencies${lockfileInfo}`,
        pnpm: `Install Node.js dependencies${lockfileInfo}`,
        pip: `Install Python dependencies from ${pm.filename}`,
        pipenv: `Install Python dependencies${lockfileInfo}`,
        poetry: `Install Python dependencies${lockfileInfo}`,
        bundler: `Install Ruby dependencies${lockfileInfo}`,
        cargo: `Build Rust project`,
        composer: `Install PHP dependencies${lockfileInfo}`,
        maven: `Install Java dependencies`,
        gradle: `Build Gradle project`,
        gomod: `Download Go dependencies`,
        pub: `Install Dart dependencies`,
    };

    return (
        descriptions[packageManagerType] ||
        `Install dependencies from ${pm.filename}`
    );
}
