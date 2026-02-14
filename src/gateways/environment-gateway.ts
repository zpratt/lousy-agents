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
    NODE_PACKAGE_MANAGERS,
    PYTHON_PACKAGE_MANAGERS,
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
        const config = await this.getConfig();

        const hasMise = await this.detectMise(targetDir);
        const versionFiles = await this.detectVersionFiles(targetDir, config);
        const packageManagers = await this.detectPackageManagers(
            targetDir,
            config,
        );

        return {
            hasMise,
            versionFiles,
            packageManagers,
        };
    }

    private async detectMise(targetDir: string): Promise<boolean> {
        const miseTomlPath = join(targetDir, "mise.toml");
        return fileExists(miseTomlPath);
    }

    private async detectVersionFiles(
        targetDir: string,
        config: CopilotSetupConfig,
    ): Promise<VersionFile[]> {
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

        return versionFiles;
    }

    private async detectPackageManagers(
        targetDir: string,
        config: CopilotSetupConfig,
    ): Promise<PackageManagerFile[]> {
        const packageManagers: PackageManagerFile[] = [];

        // Helper to check if a package manager type is in a list
        const isPackageManagerType = (
            pm: CopilotSetupConfig["packageManagers"][0],
            types: readonly string[],
        ): boolean => types.includes(pm.type);

        const nodePackageManagers = config.packageManagers.filter((pm) =>
            isPackageManagerType(pm, NODE_PACKAGE_MANAGERS),
        );
        const pythonPackageManagers = config.packageManagers.filter((pm) =>
            isPackageManagerType(pm, PYTHON_PACKAGE_MANAGERS),
        );
        const otherPackageManagers = config.packageManagers.filter(
            (pm) =>
                !isPackageManagerType(pm, NODE_PACKAGE_MANAGERS) &&
                !isPackageManagerType(pm, PYTHON_PACKAGE_MANAGERS),
        );

        // Detect Node.js package manager (with prioritization)
        const nodePackageManager = await this.detectNodePackageManager(
            targetDir,
            nodePackageManagers,
        );
        if (nodePackageManager) {
            packageManagers.push(nodePackageManager);
        }

        // Detect Python package manager (with prioritization)
        const pythonPackageManager = await this.detectPythonPackageManager(
            targetDir,
            pythonPackageManagers,
        );
        if (pythonPackageManager) {
            packageManagers.push(pythonPackageManager);
        }

        // Detect other package managers
        const otherDetectedManagers = await this.detectOtherPackageManagers(
            targetDir,
            otherPackageManagers,
        );
        packageManagers.push(...otherDetectedManagers);

        return packageManagers;
    }

    private async detectNodePackageManager(
        targetDir: string,
        nodePackageManagers: CopilotSetupConfig["packageManagers"],
    ): Promise<PackageManagerFile | null> {
        const packageJsonPath = join(targetDir, "package.json");
        if (!(await fileExists(packageJsonPath))) {
            return null;
        }

        // Priority order for Node.js package managers: npm > yarn > pnpm
        const lockfileOrder = ["npm", "yarn", "pnpm"];

        for (const pmType of lockfileOrder) {
            const pmConfig = nodePackageManagers.find(
                (pm) => pm.type === pmType,
            );
            if (!pmConfig?.lockfile) {
                continue;
            }

            const lockfilePath = join(targetDir, pmConfig.lockfile);
            if (await fileExists(lockfilePath)) {
                return {
                    type: pmConfig.type,
                    filename: pmConfig.manifestFile,
                    lockfile: pmConfig.lockfile,
                };
            }
        }

        // Default to npm if no lockfile found
        const npmConfig = nodePackageManagers.find((pm) => pm.type === "npm");
        if (npmConfig) {
            return {
                type: npmConfig.type,
                filename: npmConfig.manifestFile,
                lockfile: undefined,
            };
        }

        return null;
    }

    private async detectPythonPackageManager(
        targetDir: string,
        pythonPackageManagers: CopilotSetupConfig["packageManagers"],
    ): Promise<PackageManagerFile | null> {
        // Priority order for Python package managers: poetry > pipenv > pip
        for (const pmType of PYTHON_PACKAGE_MANAGERS) {
            const pmConfig = pythonPackageManagers.find(
                (pm) => pm.type === pmType,
            );
            if (!pmConfig) {
                continue;
            }

            const manifestPath = join(targetDir, pmConfig.manifestFile);
            if (await fileExists(manifestPath)) {
                const lockfilePath = pmConfig.lockfile
                    ? join(targetDir, pmConfig.lockfile)
                    : undefined;
                const hasLockfile = lockfilePath
                    ? await fileExists(lockfilePath)
                    : false;

                // Skip if lockfile is required but not present
                if (pmConfig.requiresLockfile && !hasLockfile) {
                    continue;
                }

                return {
                    type: pmConfig.type,
                    filename: pmConfig.manifestFile,
                    lockfile: hasLockfile ? pmConfig.lockfile : undefined,
                };
            }
        }

        return null;
    }

    private async detectOtherPackageManagers(
        targetDir: string,
        otherPackageManagers: CopilotSetupConfig["packageManagers"],
    ): Promise<PackageManagerFile[]> {
        const packageManagers: PackageManagerFile[] = [];

        for (const pmConfig of otherPackageManagers) {
            const manifestPath = join(targetDir, pmConfig.manifestFile);
            if (await fileExists(manifestPath)) {
                const lockfilePath = pmConfig.lockfile
                    ? join(targetDir, pmConfig.lockfile)
                    : undefined;
                const hasLockfile = lockfilePath
                    ? await fileExists(lockfilePath)
                    : false;

                // Skip if lockfile is required but not present
                if (pmConfig.requiresLockfile && !hasLockfile) {
                    continue;
                }

                packageManagers.push({
                    type: pmConfig.type,
                    filename: pmConfig.manifestFile,
                    lockfile: hasLockfile ? pmConfig.lockfile : undefined,
                });
            }
        }

        return packageManagers;
    }
}

/**
 * Creates and returns the default environment gateway
 */
export function createEnvironmentGateway(): EnvironmentGateway {
    return new FileSystemEnvironmentGateway();
}
