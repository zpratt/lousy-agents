/**
 * Gateway for environment detection file system operations.
 * This module abstracts file system access for environment configuration detection.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
    DetectedEnvironment,
    VersionFile,
    VersionFileType,
} from "../entities/copilot-setup.js";
import { fileExists } from "./file-system-utils.js";

/**
 * Mapping of version file names to their types
 */
const VERSION_FILE_MAPPING: Record<string, VersionFileType> = {
    ".nvmrc": "node",
    ".node-version": "node",
    ".python-version": "python",
    ".java-version": "java",
    ".ruby-version": "ruby",
    ".go-version": "go",
};

/**
 * List of supported version file names
 */
export const SUPPORTED_VERSION_FILES = Object.keys(VERSION_FILE_MAPPING);

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
    async detectEnvironment(targetDir: string): Promise<DetectedEnvironment> {
        const miseTomlPath = join(targetDir, "mise.toml");
        const hasMise = await fileExists(miseTomlPath);

        const versionFiles: VersionFile[] = [];

        for (const [filename, type] of Object.entries(VERSION_FILE_MAPPING)) {
            const filePath = join(targetDir, filename);
            if (await fileExists(filePath)) {
                const version = await readVersionFileContent(filePath);
                versionFiles.push({
                    type,
                    filename,
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
