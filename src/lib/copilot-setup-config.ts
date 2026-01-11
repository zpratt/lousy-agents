/**
 * Configuration for the copilot-setup command.
 * Uses c12 for configuration loading, allowing runtime customization.
 */

import { loadConfig } from "c12";
import type { VersionFileType } from "../entities/copilot-setup.js";

/**
 * Configuration for a version file mapping
 */
export interface VersionFileMapping {
    /**
     * The filename to detect (e.g., ".nvmrc")
     */
    filename: string;
    /**
     * The version file type (e.g., "node")
     */
    type: VersionFileType;
}

/**
 * Configuration for a setup action
 */
export interface SetupActionConfig {
    /**
     * The action name (e.g., "actions/setup-node")
     */
    action: string;
    /**
     * The version file type this action handles
     */
    type: VersionFileType;
    /**
     * The "with" config key for version file (e.g., "node-version-file")
     */
    versionFileKey: string;
}

/**
 * Configuration for copilot-setup command
 */
export interface CopilotSetupConfig {
    /**
     * List of idiomatic version files to detect
     */
    versionFiles: VersionFileMapping[];
    /**
     * List of setup actions and their configuration
     */
    setupActions: SetupActionConfig[];
    /**
     * List of action patterns to detect in existing workflows
     */
    setupActionPatterns: string[];
}

/**
 * Default version file mappings
 */
const DEFAULT_VERSION_FILES: VersionFileMapping[] = [
    { filename: ".nvmrc", type: "node" },
    { filename: ".node-version", type: "node" },
    { filename: ".python-version", type: "python" },
    { filename: ".java-version", type: "java" },
    { filename: ".ruby-version", type: "ruby" },
    { filename: ".go-version", type: "go" },
];

/**
 * Default setup action configurations
 */
const DEFAULT_SETUP_ACTIONS: SetupActionConfig[] = [
    {
        action: "actions/setup-node",
        type: "node",
        versionFileKey: "node-version-file",
    },
    {
        action: "actions/setup-python",
        type: "python",
        versionFileKey: "python-version-file",
    },
    {
        action: "actions/setup-java",
        type: "java",
        versionFileKey: "java-version-file",
    },
    {
        action: "actions/setup-ruby",
        type: "ruby",
        versionFileKey: "ruby-version-file",
    },
    {
        action: "actions/setup-go",
        type: "go",
        versionFileKey: "go-version-file",
    },
];

/**
 * Default setup action patterns to detect in workflows
 */
const DEFAULT_SETUP_ACTION_PATTERNS: string[] = [
    "actions/setup-node",
    "actions/setup-python",
    "actions/setup-java",
    "actions/setup-go",
    "actions/setup-ruby",
    "jdx/mise-action",
];

/**
 * Default copilot-setup configuration
 */
const DEFAULT_CONFIG: CopilotSetupConfig = {
    versionFiles: DEFAULT_VERSION_FILES,
    setupActions: DEFAULT_SETUP_ACTIONS,
    setupActionPatterns: DEFAULT_SETUP_ACTION_PATTERNS,
};

/**
 * Cached configuration
 */
let cachedConfig: CopilotSetupConfig | null = null;

/**
 * Loads the copilot-setup configuration using c12
 * Falls back to defaults if no configuration is found
 */
export async function loadCopilotSetupConfig(): Promise<CopilotSetupConfig> {
    if (cachedConfig) {
        return cachedConfig;
    }

    const { config } = await loadConfig<CopilotSetupConfig>({
        name: "lousy-agents",
        defaults: DEFAULT_CONFIG,
        packageJson: "copilotSetup",
    });

    cachedConfig = config || DEFAULT_CONFIG;
    return cachedConfig;
}

/**
 * Resets the cached configuration (useful for testing)
 */
export function resetCopilotSetupConfigCache(): void {
    cachedConfig = null;
}

/**
 * Gets a version file type to action mapping from config
 * Returns a partial record as not all types may be configured
 */
export function getVersionTypeToActionMap(
    config: CopilotSetupConfig,
): Partial<Record<VersionFileType, string>> {
    const map: Partial<Record<VersionFileType, string>> = {};
    for (const action of config.setupActions) {
        map[action.type] = action.action;
    }
    return map;
}

/**
 * Gets a version file type to config key mapping from config
 * Returns a partial record as not all types may be configured
 */
export function getVersionFileConfigKeyMap(
    config: CopilotSetupConfig,
): Partial<Record<VersionFileType, string>> {
    const map: Partial<Record<VersionFileType, string>> = {};
    for (const action of config.setupActions) {
        map[action.type] = action.versionFileKey;
    }
    return map;
}

/**
 * Gets a filename to version type mapping from config
 */
export function getVersionFilenameToTypeMap(
    config: CopilotSetupConfig,
): Record<string, VersionFileType> {
    const map: Record<string, VersionFileType> = {};
    for (const file of config.versionFiles) {
        map[file.filename] = file.type;
    }
    return map;
}
