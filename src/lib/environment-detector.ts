import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists } from "./filesystem-structure.js";

/**
 * Types of version files supported for detection
 */
export type VersionFileType = "node" | "python" | "java" | "ruby" | "go";

/**
 * Represents a detected version file in the repository
 */
export interface VersionFile {
    type: VersionFileType;
    filename: string;
    version?: string;
}

/**
 * Result of detecting environment configuration
 */
export interface DetectedEnvironment {
    hasMise: boolean;
    versionFiles: VersionFile[];
}

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
 * Reads the content of a version file and trims whitespace
 */
async function readVersionFileContent(filePath: string): Promise<string> {
    const content = await readFile(filePath, "utf-8");
    return content.trim();
}

/**
 * Detects environment configuration files in the specified directory
 * @param targetDir The directory to scan for configuration files
 * @returns Detected environment configuration
 */
export async function detectEnvironment(
    targetDir: string,
): Promise<DetectedEnvironment> {
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
