/**
 * Gateway for environment detection file system operations.
 * This module abstracts file system access for environment configuration detection.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
    DetectedEnvironment,
    PackageManagerFile,
    VersionFile,
} from "../entities/copilot-setup.js";
import {
    type CopilotSetupConfig,
    getVersionFilenameToTypeMap,
    loadCopilotSetupConfig,
} from "../lib/copilot-setup-config.js";
import { fileExists } from "./file-system-utils.js";

/**
 * Interface for environment detection gateway
 * Allows for different implementations (file system, mock, etc.)
 */
export interface EnvironmentGateway {
    /**
     * Detects environment configuration in the specified directory
     * @param targetDir The directory to scan for configuration files
     * @returns Detected environment configuration
     */
    detectEnvironment(targetDir: string): Promise<DetectedEnvironment>;
}

/**
 * Reads the content of a version file and trims whitespace
 */
async function readVersionFileContent(filePath: string): Promise<string> {
    const content = await readFile(filePath, "utf-8");
    return content.trim();
}

/**
 * File system implementation of the environment gateway
 */
export class FileSystemEnvironmentGateway implements EnvironmentGateway {
    private config: CopilotSetupConfig | null = null;

    private async getConfig(): Promise<CopilotSetupConfig> {
        if (!this.config) {
            this.config = await loadCopilotSetupConfig();
        }
        return this.config;
    }

    async detectEnvironment(targetDir: string): Promise<DetectedEnvironment> {
        const miseTomlPath = join(targetDir, "mise.toml");
        const hasMise = await fileExists(miseTomlPath);

        const config = await this.getConfig();
        const filenameToType = getVersionFilenameToTypeMap(config);

        const versionFiles: VersionFile[] = [];

        for (const fileConfig of config.versionFiles) {
            const filePath = join(targetDir, fileConfig.filename);
            if (await fileExists(filePath)) {
                const version = await readVersionFileContent(filePath);
                versionFiles.push({
                    type: filenameToType[fileConfig.filename],
                    filename: fileConfig.filename,
                    version: version || undefined,
                });
            }
        }

        // Detect package managers
        const packageManagers: PackageManagerFile[] = [];

        // Special handling for Node.js package managers (npm, yarn, pnpm)
        // Check lockfiles first to determine which package manager to use
        const nodePackageManagers = config.packageManagers.filter(
            (pm) =>
                pm.type === "npm" || pm.type === "yarn" || pm.type === "pnpm",
        );
        const otherPackageManagers = config.packageManagers.filter(
            (pm) =>
                pm.type !== "npm" && pm.type !== "yarn" && pm.type !== "pnpm",
        );

        // For Node.js: prioritize by lockfile existence
        const packageJsonPath = join(targetDir, "package.json");
        if (await fileExists(packageJsonPath)) {
            let nodePackageManagerDetected = false;
            // Check lockfiles in order of preference: pnpm, yarn, npm
            const lockfileOrder = ["pnpm", "yarn", "npm"];
            for (const pmType of lockfileOrder) {
                const pmConfig = nodePackageManagers.find(
                    (pm) => pm.type === pmType,
                );
                if (!pmConfig || !pmConfig.lockfile) {
                    continue;
                }
                const lockfilePath = join(targetDir, pmConfig.lockfile);
                if (await fileExists(lockfilePath)) {
                    packageManagers.push({
                        type: pmConfig.type,
                        filename: pmConfig.manifestFile,
                        lockfile: pmConfig.lockfile,
                    });
                    nodePackageManagerDetected = true;
                    break;
                }
            }
            // If no lockfile found, default to npm
            if (!nodePackageManagerDetected) {
                const npmConfig = nodePackageManagers.find(
                    (pm) => pm.type === "npm",
                );
                if (npmConfig) {
                    packageManagers.push({
                        type: npmConfig.type,
                        filename: npmConfig.manifestFile,
                        lockfile: undefined,
                    });
                }
            }
        }

        // For other package managers, check normally
        for (const pmConfig of otherPackageManagers) {
            const manifestPath = join(targetDir, pmConfig.manifestFile);
            if (await fileExists(manifestPath)) {
                const lockfilePath = pmConfig.lockfile
                    ? join(targetDir, pmConfig.lockfile)
                    : undefined;
                const hasLockfile = lockfilePath
                    ? await fileExists(lockfilePath)
                    : false;

                packageManagers.push({
                    type: pmConfig.type,
                    filename: pmConfig.manifestFile,
                    lockfile: hasLockfile ? pmConfig.lockfile : undefined,
                });
            }
        }

        return {
            hasMise,
            versionFiles,
            packageManagers,
        };
    }
}

/**
 * Creates and returns the default environment gateway
 */
export function createEnvironmentGateway(): EnvironmentGateway {
    return new FileSystemEnvironmentGateway();
}
