/**
 * Core domain entities for the Copilot Setup Steps feature.
 * These are the fundamental types that represent the business domain.
 */

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
 * Represents a setup step candidate extracted from workflows or version files
 */
export interface SetupStepCandidate {
    action: string;
    version?: string;
    config?: Record<string, unknown>;
    source: "version-file" | "workflow";
}

/**
 * Represents a step in a GitHub Actions workflow
 */
export interface WorkflowStep {
    name?: string;
    uses: string;
    with?: Record<string, unknown>;
}
