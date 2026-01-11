import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Supported version file types
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
 * Result of environment detection
 */
export interface DetectedEnvironment {
    hasMise: boolean;
    versionFiles: VersionFile[];
}

/**
 * Mapping of version file names to their types
 */
const VERSION_FILE_MAPPINGS: Record<string, VersionFileType> = {
    ".nvmrc": "node",
    ".node-version": "node",
    ".python-version": "python",
    ".java-version": "java",
    ".ruby-version": "ruby",
    ".go-version": "go",
};

/**
 * List of all supported version file names
 */
export const SUPPORTED_VERSION_FILES = Object.keys(VERSION_FILE_MAPPINGS);

/**
 * Checks if a file exists by attempting to read it
 * @param filePath Path to check
 * @returns True if file exists, false otherwise
 */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await readFile(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Reads the content of a file, returning undefined if it doesn't exist
 * @param filePath Path to read
 * @returns File content or undefined
 */
async function readFileContent(filePath: string): Promise<string | undefined> {
    try {
        const content = await readFile(filePath, "utf-8");
        return content.trim();
    } catch {
        return undefined;
    }
}

/**
 * Detects environment configuration files in a repository
 * @param rootDir The root directory to scan (defaults to current working directory)
 * @returns DetectedEnvironment with information about found configuration files
 */
export async function detectEnvironment(
    rootDir: string = process.cwd(),
): Promise<DetectedEnvironment> {
    // Check for mise.toml
    const miseTomlPath = join(rootDir, "mise.toml");
    const hasMise = await fileExists(miseTomlPath);

    // Check for version files
    const versionFiles: VersionFile[] = [];

    for (const filename of SUPPORTED_VERSION_FILES) {
        const filePath = join(rootDir, filename);
        const content = await readFileContent(filePath);

        if (content !== undefined) {
            const type = VERSION_FILE_MAPPINGS[filename];
            versionFiles.push({
                type,
                filename,
                version: content || undefined,
            });
        }
    }

    return {
        hasMise,
        versionFiles,
    };
}
