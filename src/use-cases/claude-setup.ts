/**
 * Use cases for Claude Code Web Environment Setup feature.
 * This module handles the logic of building SessionStart hooks from environment detection,
 * merging settings, and generating documentation.
 */

import type {
    ClaudeSettings,
    SessionStartHook,
} from "../entities/claude-setup.js";
import type {
    DetectedEnvironment,
    PackageManagerFile,
    VersionFile,
    VersionFileType,
} from "../entities/copilot-setup.js";
import {
    type CopilotSetupConfig,
    loadCopilotSetupConfig,
} from "../lib/copilot-setup-config.js";

/**
 * List of allowed version filenames.
 * Using a hardcoded allowlist prevents command injection via malicious filenames
 * in user-customizable config files.
 */
const ALLOWED_VERSION_FILENAMES = [
    ".nvmrc",
    ".node-version",
    ".python-version",
    ".java-version",
    ".ruby-version",
    ".go-version",
] as const;

/**
 * Validates that a filename is in the allowlist of known version files.
 * Prevents command injection by only allowing hardcoded safe filenames.
 *
 * @param filename The filename to validate
 * @returns true if filename is in the allowlist
 */
function isValidVersionFilename(filename: string): boolean {
    return ALLOWED_VERSION_FILENAMES.includes(
        filename as (typeof ALLOWED_VERSION_FILENAMES)[number],
    );
}

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
    const versionInfo = versionFile.version ? ` (${versionFile.version})` : "";

    if (!isValidVersionFilename(versionFile.filename)) {
        return null;
    }

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
 * Gets a description for a package manager hook.
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

/**
 * Merges SessionStart hooks into existing Claude settings.
 * Preserves existing settings while adding or updating hooks without duplication.
 *
 * @param existing Existing Claude settings or null if none exist
 * @param hooks Array of SessionStart hooks to merge
 * @returns Merged Claude settings
 */
export function mergeClaudeSettings(
    existing: ClaudeSettings | null,
    hooks: SessionStartHook[],
): ClaudeSettings {
    // If no existing settings, create new with hooks
    if (!existing) {
        return {
            // biome-ignore lint/style/useNamingConvention: SessionStart is the Claude Code API property name
            SessionStart: hooks.map((h) => h.command),
        };
    }

    // Preserve all existing settings
    const merged: ClaudeSettings = { ...existing };

    // Get existing SessionStart commands or empty array
    const existingCommands = existing.SessionStart || [];

    // Merge new hooks with existing commands in deterministic order:
    // 1) tool-generated commands (from hooks) in their original order
    // 2) any existing commands not already included, preserving their order
    const newCommands = hooks.map((h) => h.command);
    const mergedCommands: string[] = [];

    for (const command of newCommands) {
        if (!mergedCommands.includes(command)) {
            mergedCommands.push(command);
        }
    }

    for (const command of existingCommands) {
        if (!mergedCommands.includes(command)) {
            mergedCommands.push(command);
        }
    }

    merged.SessionStart = mergedCommands;

    return merged;
}

/**
 * Generates an Environment Setup section for CLAUDE.md documentation.
 * Creates markdown documenting the detected environment and SessionStart hooks.
 *
 * @param environment The detected environment configuration
 * @param hooks Array of SessionStart hooks
 * @returns Markdown content for Environment Setup section
 */
export function generateEnvironmentSetupSection(
    environment: DetectedEnvironment,
    hooks: SessionStartHook[],
): string {
    const lines: string[] = [];

    lines.push("## Environment Setup");
    lines.push("");

    // Document detected configuration
    if (environment.hasMise) {
        lines.push(
            "This project uses [mise](https://mise.jdx.dev/) for runtime management.",
        );
        lines.push("");
    }

    if (environment.versionFiles.length > 0) {
        lines.push("### Detected Runtimes");
        lines.push("");
        for (const vf of environment.versionFiles) {
            const versionInfo = vf.version ? ` (${vf.version})` : "";
            lines.push(`- **${vf.type}**: ${vf.filename}${versionInfo}`);
        }
        lines.push("");
    }

    if (environment.packageManagers.length > 0) {
        lines.push("### Package Managers");
        lines.push("");
        for (const pm of environment.packageManagers) {
            const lockfileInfo = pm.lockfile ? ` with ${pm.lockfile}` : "";
            lines.push(`- **${pm.type}**: ${pm.filename}${lockfileInfo}`);
        }
        lines.push("");
    }

    // Document SessionStart hooks
    if (hooks.length > 0) {
        lines.push("### SessionStart Hooks");
        lines.push("");
        lines.push(
            "The following commands run automatically when a Claude Code session starts:",
        );
        lines.push("");
        for (const hook of hooks) {
            lines.push("```bash");
            lines.push(hook.command);
            lines.push("```");
            if (hook.description) {
                lines.push(`*${hook.description}*`);
            }
            lines.push("");
        }
    } else {
        lines.push(
            "No environment-specific configuration detected. If this project requires specific runtimes or dependencies, add version files (e.g., `.nvmrc`, `.python-version`) or dependency manifests (e.g., `package.json`, `requirements.txt`) to enable automated setup.",
        );
        lines.push("");
    }

    return lines.join("\n");
}

/**
 * Merges an Environment Setup section into existing CLAUDE.md documentation.
 * Replaces existing section if found, or appends if not present.
 *
 * @param existing Existing CLAUDE.md content or null if file doesn't exist
 * @param setupSection The Environment Setup section content
 * @returns Updated CLAUDE.md content
 */
export function mergeClaudeDocumentation(
    existing: string | null,
    setupSection: string,
): string {
    // If no existing documentation, create new with setup section
    if (!existing) {
        return `# Claude Code Environment\n\n${setupSection}`;
    }

    // Split content into lines and find Environment Setup section
    const lines = existing.split("\n");
    let inEnvSetup = false;
    let envSetupStartLine = -1;
    let envSetupEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line === "## Environment Setup") {
            inEnvSetup = true;
            envSetupStartLine = i;
            continue;
        }

        if (inEnvSetup && (line.startsWith("## ") || line.startsWith("# "))) {
            // Found next section
            envSetupEndLine = i;
            break;
        }
    }

    // If we found Environment Setup section
    if (envSetupStartLine >= 0) {
        // If we didn't find an end, it goes to the end of file
        if (envSetupEndLine === -1) {
            envSetupEndLine = lines.length;
        }

        // Replace the section
        const before = lines.slice(0, envSetupStartLine).join("\n");
        const after = lines.slice(envSetupEndLine).join("\n");

        const parts = [before.trimEnd()];
        if (before.trim()) {
            parts.push("\n\n");
        }
        parts.push(setupSection.trimEnd());
        if (after.trim()) {
            parts.push("\n\n");
            parts.push(after);
        }

        return parts.join("");
    }

    // Append section to end
    const trimmedExisting = existing.trimEnd();
    return `${trimmedExisting}\n\n${setupSection}`;
}
