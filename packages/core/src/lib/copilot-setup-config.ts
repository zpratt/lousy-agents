/**
 * Configuration for the copilot-setup command.
 * Uses c12 for configuration loading, allowing runtime customization.
 */

import { loadConfig } from "c12";
import { z } from "zod";
import type {
    PackageManagerType,
    VersionFileType,
} from "../entities/copilot-setup.js";
import {
    type CopilotSetupConfig,
    DEFAULT_COPILOT_SETUP_CONFIG,
    PACKAGE_MANAGER_INSTALL_COMMANDS,
} from "../entities/copilot-setup-config.js";

export type {
    CopilotSetupConfig,
    PackageManagerMapping,
    SetupActionConfig,
    VersionFileMapping,
} from "../entities/copilot-setup-config.js";

const SAFE_BASENAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const SAFE_ACTION_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_VERSION_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
const MAX_FILENAME_LENGTH = 255;

const VERSION_FILE_TYPES: [VersionFileType, ...VersionFileType[]] = [
    "node",
    "python",
    "java",
    "ruby",
    "go",
];

const PACKAGE_MANAGER_TYPES: [PackageManagerType, ...PackageManagerType[]] = [
    "npm",
    "yarn",
    "pnpm",
    "pip",
    "pipenv",
    "poetry",
    "bundler",
    "cargo",
    "composer",
    "maven",
    "gradle",
    "gomod",
    "pub",
];

function isSafeBasename(value: string): boolean {
    return (
        value.length > 0 &&
        value.length <= MAX_FILENAME_LENGTH &&
        SAFE_BASENAME_PATTERN.test(value) &&
        !value.includes("..")
    );
}

const VersionFileMappingSchema = z
    .object({
        filename: z.string(),
        type: z.enum(VERSION_FILE_TYPES),
    })
    .strict()
    .superRefine((value, context) => {
        if (!isSafeBasename(value.filename)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["filename"],
                message:
                    "versionFiles.filename must be a safe basename without traversal or directory separators",
            });
        }
    });

const SetupActionConfigSchema = z
    .object({
        action: z.string().regex(SAFE_ACTION_PATTERN, {
            message: "setupActions.action must be in owner/repo format",
        }),
        type: z.enum(VERSION_FILE_TYPES),
        versionFileKey: z.string().regex(SAFE_VERSION_KEY_PATTERN, {
            message:
                "setupActions.versionFileKey must use lowercase kebab-case",
        }),
    })
    .strict();

const PackageManagerMappingSchema = z
    .object({
        type: z.enum(PACKAGE_MANAGER_TYPES),
        manifestFile: z.string(),
        lockfile: z.string().optional(),
        requiresLockfile: z.boolean().optional(),
        installCommand: z.string(),
    })
    .strict()
    .superRefine((value, context) => {
        if (!isSafeBasename(value.manifestFile)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["manifestFile"],
                message:
                    "packageManagers.manifestFile must be a safe basename without traversal or directory separators",
            });
        }

        if (value.lockfile && !isSafeBasename(value.lockfile)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["lockfile"],
                message:
                    "packageManagers.lockfile must be a safe basename without traversal or directory separators",
            });
        }

        const expectedInstallCommand =
            PACKAGE_MANAGER_INSTALL_COMMANDS[value.type];
        if (value.installCommand !== expectedInstallCommand) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["installCommand"],
                message: `packageManagers.installCommand for ${value.type} must be '${expectedInstallCommand}'`,
            });
        }
    });

const CopilotSetupConfigSchema = z.object({
    versionFiles: z.array(VersionFileMappingSchema).min(1),
    setupActions: z.array(SetupActionConfigSchema).min(1),
    setupActionPatterns: z
        .array(
            z.string().regex(SAFE_ACTION_PATTERN, {
                message:
                    "setupActionPatterns entries must be in owner/repo format",
            }),
        )
        .min(1),
    packageManagers: z.array(PackageManagerMappingSchema).min(1),
});

/**
 * Validates loaded copilot-setup configuration and rejects unsafe values.
 */
export function validateCopilotSetupConfig(
    config: unknown,
): CopilotSetupConfig {
    return CopilotSetupConfigSchema.parse(config);
}

/**
 * Loads the copilot-setup configuration using c12.
 * Falls back to defaults if no configuration is found.
 * @param cwd Optional working directory to load config from (defaults to process.cwd())
 */
export async function loadCopilotSetupConfig(
    cwd?: string,
): Promise<CopilotSetupConfig> {
    const { config } = await loadConfig<CopilotSetupConfig>({
        name: "lousy-agents",
        cwd,
        defaults: DEFAULT_COPILOT_SETUP_CONFIG,
        packageJson: "copilotSetup",
    });

    return validateCopilotSetupConfig(config ?? DEFAULT_COPILOT_SETUP_CONFIG);
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
 * Gets a version file type to action mapping from config.
 * Returns a partial record as not all types may be configured.
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
 * Gets a version file type to config key mapping from config.
 * Returns a partial record as not all types may be configured.
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
 * Gets a filename to version type mapping from config.
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
