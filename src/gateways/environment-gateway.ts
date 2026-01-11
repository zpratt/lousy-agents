/**
 * Gateway for environment detection file system operations.
 * This module abstracts file system access for environment configuration detection.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
    DetectedEnvironment,
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

        return {
            hasMise,
            versionFiles,
        };
    }
}

/**
 * Creates and returns the default environment gateway
 */
export function createEnvironmentGateway(): EnvironmentGateway {
    return new FileSystemEnvironmentGateway();
}
