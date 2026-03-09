/**
 * Use case for building action resolution metadata.
 * This module provides logic for identifying actions that need version resolution
 * and generating lookup URLs for the LLM to fetch latest versions.
 */

import type {
    ActionToResolve,
    ResolvedVersion,
    SetupStepCandidate,
} from "../entities/copilot-setup.js";

/**
 * The placeholder string used in workflow templates when version resolution is needed.
 */
export const VERSION_PLACEHOLDER = "RESOLVE_VERSION";

/**
 * Instructions for the LLM to resolve action versions.
 */
export const VERSION_RESOLUTION_INSTRUCTIONS = `To resolve action versions:
1. For each action in actionsToResolve, fetch the lookup_url to find the latest release
2. Find the latest release tag (e.g., v4.0.0)
3. Get the commit SHA for that tag from the release page or GitHub API
4. Pin actions to SHA with version comment: action@SHA  # vX.X.X
5. Call this tool again with resolvedVersions to generate the final workflow

Example resolved format: actions/setup-node@1a2b3c4d5e6f  # v4.0.0`;

/**
 * Generates a GitHub releases lookup URL for an action.
 * @param action The action name (e.g., "actions/setup-node")
 * @returns The URL to the action's latest release page
 */
export function generateLookupUrl(action: string): string {
    return `https://github.com/${action}/releases/latest`;
}

/**
 * Builds an ActionToResolve entry for a given action.
 * @param action The action name (e.g., "actions/setup-node")
 * @returns ActionToResolve metadata for the action
 */
export function buildActionToResolve(action: string): ActionToResolve {
    return {
        action,
        currentPlaceholder: VERSION_PLACEHOLDER,
        lookupUrl: generateLookupUrl(action),
    };
}

/**
 * Builds an array of ActionToResolve entries from setup step candidates.
 * Filters out actions that already have resolved versions.
 * @param candidates The setup step candidates
 * @param resolvedVersions Optional array of already-resolved versions
 * @returns Array of actions that need version resolution
 */
export function buildActionsToResolve(
    candidates: SetupStepCandidate[],
    resolvedVersions?: ResolvedVersion[],
): ActionToResolve[] {
    const resolvedActions = new Set(
        resolvedVersions?.map((r) => r.action) ?? [],
    );

    // Include checkout action which is always added to workflows
    const allActions = ["actions/checkout", ...candidates.map((c) => c.action)];

    // Deduplicate and filter out already-resolved actions
    const uniqueActions = [...new Set(allActions)].filter(
        (action) => !resolvedActions.has(action),
    );

    return uniqueActions.map(buildActionToResolve);
}

/**
 * Formats an action reference with SHA pinning and version comment.
 * @param action The action name (e.g., "actions/setup-node")
 * @param sha The commit SHA
 * @param versionTag The version tag for the comment (e.g., "v4.0.0")
 * @returns Formatted action reference (e.g., "actions/setup-node@abc123  # v4.0.0")
 */
export function formatShaPinnedAction(
    action: string,
    sha: string,
    versionTag: string,
): string {
    return `${action}@${sha}  # ${versionTag}`;
}

/**
 * Finds a resolved version for a given action.
 * @param action The action name to look up
 * @param resolvedVersions Array of resolved versions
 * @returns The resolved version or undefined if not found
 */
export function findResolvedVersion(
    action: string,
    resolvedVersions: ResolvedVersion[],
): ResolvedVersion | undefined {
    return resolvedVersions.find((r) => r.action === action);
}

/**
 * Gets the version string to use for an action.
 * Returns SHA-pinned format if resolved, or placeholder if not.
 * @param action The action name
 * @param resolvedVersions Optional array of resolved versions
 * @param fallbackVersion Optional fallback version (e.g., "v4")
 * @returns The version string to use in the workflow
 */
export function getActionVersion(
    action: string,
    resolvedVersions?: ResolvedVersion[],
    fallbackVersion?: string,
): string {
    if (resolvedVersions) {
        const resolved = findResolvedVersion(action, resolvedVersions);
        if (resolved) {
            return `${resolved.sha}  # ${resolved.versionTag}`;
        }
    }

    // If we have a fallback version (from existing workflow or gateway), use it
    if (fallbackVersion) {
        return fallbackVersion;
    }

    // Otherwise, use placeholder
    return VERSION_PLACEHOLDER;
}

/**
 * Checks if all required actions have been resolved.
 * @param candidates The setup step candidates
 * @param resolvedVersions Array of resolved versions
 * @returns True if all actions (including checkout) are resolved
 */
export function allActionsResolved(
    candidates: SetupStepCandidate[],
    resolvedVersions: ResolvedVersion[],
): boolean {
    const actionsToResolve = buildActionsToResolve(
        candidates,
        resolvedVersions,
    );
    return actionsToResolve.length === 0;
}
