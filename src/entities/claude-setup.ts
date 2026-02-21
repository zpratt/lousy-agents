/**
 * Core domain entities for Claude Code Web Environment Setup feature.
 * These are the fundamental types that represent the business domain.
 */

import type { DetectedEnvironment } from "./copilot-setup.js";

/**
 * Represents a SessionStart hook command for Claude Code web environment
 */
export interface SessionStartHook {
    /** The command to run in the SessionStart hook */
    readonly command: string;
    /** Description of what this hook does (for documentation) */
    readonly description?: string;
}

/**
 * Claude Code settings.json structure
 */
export interface ClaudeSettings {
    /** SessionStart hooks for environment initialization */
    // biome-ignore lint/style/useNamingConvention: SessionStart is the Claude Code API property name
    SessionStart?: string[];
    /** Other settings preserved during merge (enabledPlugins, etc.) */
    [key: string]: unknown;
}

/**
 * Type of action taken when generating Claude setup
 */
export type ClaudeSetupAction = "created" | "updated" | "no_changes_needed";

/**
 * Recommendation for UI-level environment configuration
 */
export interface ClaudeEnvironmentRecommendation {
    /** Type of recommendation */
    readonly type: "network_access" | "environment_variable" | "other";
    /** Description of the recommendation */
    readonly description: string;
}

/**
 * Result of generating Claude Code web environment setup
 */
export interface ClaudeSetupResult {
    /** SessionStart hooks that were generated */
    readonly hooks: ReadonlyArray<SessionStartHook>;
    /** Detected environment details */
    readonly environment: DetectedEnvironment;
    /** Path to created/updated settings.json */
    readonly settingsPath: string;
    /** Path to created/updated CLAUDE.md */
    readonly documentationPath: string;
    /** Action taken: created, updated, or no_changes_needed */
    readonly action: ClaudeSetupAction;
    /** Recommendations for UI-level configuration */
    readonly recommendations?: ReadonlyArray<ClaudeEnvironmentRecommendation>;
}
