/**
 * Gateway for environment detection file system operations.
 * This module abstracts file system access for environment configuration detection.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
import {
    assertFileSizeWithinLimit,
    fileExists,
    resolveSafePath,
} from "./file-system-utils.js";

const MAX_VERSION_FILE_BYTES = 16 * 1024;

/**
 * Interface for environment detection gateway.
 */
export interface EnvironmentGateway {
    detectEnvironment(targetDir: string): Promise<DetectedEnvironment>;
}

async function readVersionFileContent(filePath: string): Promise<string> {
    await assertFileSizeWithinLimit(
        filePath,
        MAX_VERSION_FILE_BYTES,
        `Version file '${filePath}'`,
    );
    const content = await readFile(filePath, "utf-8");
    return content.trim();
}

/**
 * File system implementation of the environment gateway.
 */
export class FileSystemEnvironmentGateway implements EnvironmentGateway {
    private config: CopilotSetupConfig | null = null;

    constructor(private readonly cwd?: string) {}

    private async getConfig(): Promise<CopilotSetupConfig> {
        if (!this.config) {
            this.config = await loadCopilotSetupConfig(
                this.cwd !== undefined ? resolve(this.cwd) : undefined,
            );
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
        const miseTomlPath = await resolveSafePath(targetDir, "mise.toml");
        return fileExists(miseTomlPath);
    }

    private async detectVersionFiles(
        targetDir: string,
        config: CopilotSetupConfig,
    ): Promise<VersionFile[]> {
        const filenameToType = getVersionFilenameToTypeMap(config);
        const versionFiles: VersionFile[] = [];

        for (const fileConfig of config.versionFiles) {
            const filePath = await resolveSafePath(
                targetDir,
                fileConfig.filename,
            );
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

        const nodePackageManager = await this.detectNodePackageManager(
            targetDir,
            nodePackageManagers,
        );
        if (nodePackageManager) {
            packageManagers.push(nodePackageManager);
        }

        const pythonPackageManager = await this.detectPythonPackageManager(
            targetDir,
            pythonPackageManagers,
        );
        if (pythonPackageManager) {
            packageManagers.push(pythonPackageManager);
        }

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
        const packageJsonPath = await resolveSafePath(
            targetDir,
            "package.json",
        );
        if (!(await fileExists(packageJsonPath))) {
            return null;
        }

        const lockfileOrder = ["npm", "yarn", "pnpm"];

        for (const pmType of lockfileOrder) {
            const pmConfig = nodePackageManagers.find(
                (pm) => pm.type === pmType,
            );
            if (!pmConfig?.lockfile) {
                continue;
            }

            const lockfilePath = await resolveSafePath(
                targetDir,
                pmConfig.lockfile,
            );
            if (await fileExists(lockfilePath)) {
                return {
                    type: pmConfig.type,
                    filename: pmConfig.manifestFile,
                    lockfile: pmConfig.lockfile,
                };
            }
        }

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
        for (const pmType of PYTHON_PACKAGE_MANAGERS) {
            const pmConfig = pythonPackageManagers.find(
                (pm) => pm.type === pmType,
            );
            if (!pmConfig) {
                continue;
            }

            const manifestPath = await resolveSafePath(
                targetDir,
                pmConfig.manifestFile,
            );
            if (await fileExists(manifestPath)) {
                const lockfilePath = pmConfig.lockfile
                    ? await resolveSafePath(targetDir, pmConfig.lockfile)
                    : undefined;
                const hasLockfile = lockfilePath
                    ? await fileExists(lockfilePath)
                    : false;

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
            const manifestPath = await resolveSafePath(
                targetDir,
                pmConfig.manifestFile,
            );
            if (await fileExists(manifestPath)) {
                const lockfilePath = pmConfig.lockfile
                    ? await resolveSafePath(targetDir, pmConfig.lockfile)
                    : undefined;
                const hasLockfile = lockfilePath
                    ? await fileExists(lockfilePath)
                    : false;

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
 * Creates and returns the default environment gateway.
 * @param cwd Optional working directory for config loading (defaults to process.cwd())
 */
export function createEnvironmentGateway(cwd?: string): EnvironmentGateway {
    return new FileSystemEnvironmentGateway(cwd);
}
