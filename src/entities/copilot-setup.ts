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

/**
 * Represents an action that needs version resolution.
 * Used to prompt the LLM to look up the latest version.
 */
export interface ActionToResolve {
    /** Action name without version (e.g., "actions/setup-node") */
    action: string;
    /** Placeholder used in workflow template (e.g., "RESOLVE_VERSION") */
    currentPlaceholder: string;
    /** URL to lookup latest version (e.g., "https://github.com/actions/setup-node/releases/latest") */
    lookupUrl: string;
}

/**
 * Represents a resolved action version with SHA and tag.
 * Used when the LLM has looked up and resolved the version.
 */
export interface ResolvedVersion {
    /** Action name without version (e.g., "actions/setup-node") */
    action: string;
    /** Resolved commit SHA */
    sha: string;
    /** Version tag for human-readable comment (e.g., "v4.0.0") */
    versionTag: string;
}
