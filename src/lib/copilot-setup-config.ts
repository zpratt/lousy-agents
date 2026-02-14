/**
 * Configuration for the copilot-setup command.
 * Uses c12 for configuration loading, allowing runtime customization.
 */

import { loadConfig } from "c12";
import type {
    PackageManagerType,
    VersionFileType,
} from "../entities/copilot-setup.js";

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
 * Configuration for a package manager mapping
 */
export interface PackageManagerMapping {
    /**
     * The type of package manager (e.g., "npm", "pip")
     */
    type: PackageManagerType;
    /**
     * The manifest filename to detect (e.g., "package.json", "requirements.txt")
     */
    manifestFile: string;
    /**
     * Optional lockfile to detect (e.g., "package-lock.json")
     */
    lockfile?: string;
    /**
     * The install command to run (e.g., "npm ci", "pip install -r requirements.txt")
     */
    installCommand: string;
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
    /**
     * List of package manager mappings for install step generation
     */
    packageManagers: PackageManagerMapping[];
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
 * Default package manager mappings
 * Based on Dependabot supported ecosystems
 */
const DEFAULT_PACKAGE_MANAGERS: PackageManagerMapping[] = [
    // Node.js package managers
    {
        type: "npm",
        manifestFile: "package.json",
        lockfile: "package-lock.json",
        installCommand: "npm ci",
    },
    {
        type: "yarn",
        manifestFile: "package.json",
        lockfile: "yarn.lock",
        installCommand: "yarn install --frozen-lockfile",
    },
    {
        type: "pnpm",
        manifestFile: "package.json",
        lockfile: "pnpm-lock.yaml",
        installCommand: "pnpm install --frozen-lockfile",
    },
    // Python package managers
    {
        type: "pip",
        manifestFile: "requirements.txt",
        installCommand: "pip install -r requirements.txt",
    },
    {
        type: "pipenv",
        manifestFile: "Pipfile",
        lockfile: "Pipfile.lock",
        installCommand: "pipenv install --deploy",
    },
    {
        type: "poetry",
        manifestFile: "poetry.lock",
        lockfile: "poetry.lock",
        installCommand: "poetry install --no-root",
    },
    // Ruby
    {
        type: "bundler",
        manifestFile: "Gemfile",
        lockfile: "Gemfile.lock",
        installCommand: "bundle install",
    },
    // Rust
    {
        type: "cargo",
        manifestFile: "Cargo.toml",
        lockfile: "Cargo.lock",
        installCommand: "cargo build",
    },
    // PHP
    {
        type: "composer",
        manifestFile: "composer.json",
        lockfile: "composer.lock",
        installCommand: "composer install",
    },
    // Java
    {
        type: "maven",
        manifestFile: "pom.xml",
        installCommand: "mvn install -DskipTests",
    },
    {
        type: "gradle",
        manifestFile: "build.gradle",
        installCommand: "gradle build -x test",
    },
    // Go
    {
        type: "gomod",
        manifestFile: "go.mod",
        lockfile: "go.sum",
        installCommand: "go mod download",
    },
    // Dart/Flutter
    {
        type: "pub",
        manifestFile: "pubspec.yaml",
        lockfile: "pubspec.lock",
        installCommand: "dart pub get",
    },
];

/**
 * Default copilot-setup configuration
 */
const DEFAULT_CONFIG: CopilotSetupConfig = {
    versionFiles: DEFAULT_VERSION_FILES,
    setupActions: DEFAULT_SETUP_ACTIONS,
    setupActionPatterns: DEFAULT_SETUP_ACTION_PATTERNS,
    packageManagers: DEFAULT_PACKAGE_MANAGERS,
};

/**
 * Loads the copilot-setup configuration using c12
 * Falls back to defaults if no configuration is found
 */
export async function loadCopilotSetupConfig(): Promise<CopilotSetupConfig> {
    const { config } = await loadConfig<CopilotSetupConfig>({
        name: "lousy-agents",
        defaults: DEFAULT_CONFIG,
        packageJson: "copilotSetup",
    });

    return config || DEFAULT_CONFIG;
}

/**
 * Resets the cached configuration (useful for testing)
 *
 * This function is retained for backwards compatibility but is a no-op
 * because configuration is no longer cached at module scope.
 */
export function resetCopilotSetupConfigCache(): void {
    // no in-memory cache to reset
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
