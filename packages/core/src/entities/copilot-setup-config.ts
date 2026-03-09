import type { PackageManagerType, VersionFileType } from "./copilot-setup.js";

/**
 * Configuration for a version file mapping.
 */
export interface VersionFileMapping {
    /**
     * The filename to detect (e.g., ".nvmrc").
     */
    filename: string;
    /**
     * The version file type (e.g., "node").
     */
    type: VersionFileType;
}

/**
 * Configuration for a setup action.
 */
export interface SetupActionConfig {
    /**
     * The action name (e.g., "actions/setup-node").
     */
    action: string;
    /**
     * The version file type this action handles.
     */
    type: VersionFileType;
    /**
     * The "with" config key for version file (e.g., "node-version-file").
     */
    versionFileKey: string;
}

/**
 * Canonical install command per package manager type.
 * Commands are intentionally fixed to a safe allowlist.
 */
export const PACKAGE_MANAGER_INSTALL_COMMANDS: Record<
    PackageManagerType,
    string
> = {
    npm: "npm ci",
    yarn: "yarn install --frozen-lockfile",
    pnpm: "pnpm install --frozen-lockfile",
    pip: "pip install -r requirements.txt",
    pipenv: "pipenv install --deploy",
    poetry: "poetry install --no-root",
    bundler: "bundle install",
    cargo: "cargo build",
    composer: "composer install",
    maven: "mvn install -DskipTests",
    gradle: "gradle build -x test",
    gomod: "go mod download",
    pub: "dart pub get",
};

/**
 * Configuration for a package manager mapping.
 */
export interface PackageManagerMapping {
    /**
     * The type of package manager (e.g., "npm", "pip").
     */
    type: PackageManagerType;
    /**
     * The manifest filename to detect (e.g., "package.json", "requirements.txt").
     */
    manifestFile: string;
    /**
     * Optional lockfile to detect (e.g., "package-lock.json").
     */
    lockfile?: string;
    /**
     * Whether the lockfile must exist for this package manager to be detected.
     */
    requiresLockfile?: boolean;
    /**
     * The install command to run.
     */
    installCommand: string;
}

/**
 * Configuration for copilot-setup command.
 */
export interface CopilotSetupConfig {
    /**
     * List of idiomatic version files to detect.
     */
    versionFiles: VersionFileMapping[];
    /**
     * List of setup actions and their configuration.
     */
    setupActions: SetupActionConfig[];
    /**
     * List of action patterns to detect in existing workflows.
     */
    setupActionPatterns: string[];
    /**
     * List of package manager mappings for install step generation.
     */
    packageManagers: PackageManagerMapping[];
}

/**
 * Default version file mappings.
 */
export const DEFAULT_VERSION_FILES: VersionFileMapping[] = [
    { filename: ".nvmrc", type: "node" },
    { filename: ".node-version", type: "node" },
    { filename: ".python-version", type: "python" },
    { filename: ".java-version", type: "java" },
    { filename: ".ruby-version", type: "ruby" },
    { filename: ".go-version", type: "go" },
];

/**
 * Default setup action configurations.
 */
export const DEFAULT_SETUP_ACTIONS: SetupActionConfig[] = [
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
 * Default setup action patterns to detect in workflows.
 */
export const DEFAULT_SETUP_ACTION_PATTERNS: string[] = [
    "actions/setup-node",
    "actions/setup-python",
    "actions/setup-java",
    "actions/setup-go",
    "actions/setup-ruby",
    "jdx/mise-action",
];

/**
 * Default package manager mappings based on common ecosystems.
 */
export const DEFAULT_PACKAGE_MANAGERS: PackageManagerMapping[] = [
    {
        type: "npm",
        manifestFile: "package.json",
        lockfile: "package-lock.json",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.npm,
    },
    {
        type: "yarn",
        manifestFile: "package.json",
        lockfile: "yarn.lock",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.yarn,
    },
    {
        type: "pnpm",
        manifestFile: "package.json",
        lockfile: "pnpm-lock.yaml",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.pnpm,
    },
    {
        type: "pip",
        manifestFile: "requirements.txt",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.pip,
    },
    {
        type: "pipenv",
        manifestFile: "Pipfile",
        lockfile: "Pipfile.lock",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.pipenv,
    },
    {
        type: "poetry",
        manifestFile: "pyproject.toml",
        lockfile: "poetry.lock",
        requiresLockfile: true,
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.poetry,
    },
    {
        type: "bundler",
        manifestFile: "Gemfile",
        lockfile: "Gemfile.lock",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.bundler,
    },
    {
        type: "cargo",
        manifestFile: "Cargo.toml",
        lockfile: "Cargo.lock",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.cargo,
    },
    {
        type: "composer",
        manifestFile: "composer.json",
        lockfile: "composer.lock",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.composer,
    },
    {
        type: "maven",
        manifestFile: "pom.xml",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.maven,
    },
    {
        type: "gradle",
        manifestFile: "build.gradle",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.gradle,
    },
    {
        type: "gomod",
        manifestFile: "go.mod",
        lockfile: "go.sum",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.gomod,
    },
    {
        type: "pub",
        manifestFile: "pubspec.yaml",
        lockfile: "pubspec.lock",
        installCommand: PACKAGE_MANAGER_INSTALL_COMMANDS.pub,
    },
];

/**
 * Default copilot-setup configuration.
 */
export const DEFAULT_COPILOT_SETUP_CONFIG: CopilotSetupConfig = {
    versionFiles: DEFAULT_VERSION_FILES,
    setupActions: DEFAULT_SETUP_ACTIONS,
    setupActionPatterns: DEFAULT_SETUP_ACTION_PATTERNS,
    packageManagers: DEFAULT_PACKAGE_MANAGERS,
};
