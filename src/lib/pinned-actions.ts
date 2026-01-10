/**
 * Configuration for pinned GitHub Actions versions.
 *
 * Actions are pinned to specific commit SHAs for reproducibility and security.
 * Each entry includes the full SHA and a version comment for documentation.
 *
 * To update an action version:
 * 1. Find the latest stable release on GitHub
 * 2. Get the full commit SHA for that release tag
 * 3. Update the sha and version fields below
 */

/**
 * GitHub Actions expression for github.token
 * Split to avoid linter false positive about template strings
 */
export const GITHUB_TOKEN_EXPR = "$" + "{{ github.token }}";

export interface PinnedAction {
    /** Full commit SHA for the action */
    sha: string;
    /** Version tag (e.g., "v4.2.2") for documentation */
    version: string;
    /** Human-readable display name for the action */
    displayName?: string;
    /** Parameter key for version file (e.g., "node-version-file") */
    versionFileKey?: string;
    /** Additional default parameters for the action */
    defaultWith?: Record<string, string>;
    /** Command to verify the runtime is installed correctly */
    verifyCommand?: string;
}

/**
 * Map of action names to their pinned versions.
 * Keys are the action identifier (e.g., "actions/checkout").
 */
export const PINNED_ACTIONS: Record<string, PinnedAction> = {
    "actions/checkout": {
        sha: "11bd71901bbe5b1630ceea73d27597364c9af683",
        version: "v4.2.2",
    },
    "actions/setup-node": {
        sha: "39370e3970a6d050c480ffad4ff0ed4d3fdee5af",
        version: "v4.1.0",
        displayName: "Node.js",
        versionFileKey: "node-version-file",
        verifyCommand: "node --version && npm --version",
    },
    "actions/setup-python": {
        sha: "0b93645e9fea7318ecaed2b359559ac225c90a2b",
        version: "v5.3.0",
        displayName: "Python",
        versionFileKey: "python-version-file",
        verifyCommand: "python --version",
    },
    "actions/setup-java": {
        sha: "7a6d8a8234af8eb26422e24e3006232cccaa061b",
        version: "v4.6.0",
        displayName: "Java",
        versionFileKey: "java-version-file",
        defaultWith: { distribution: "temurin" },
        verifyCommand: "java --version",
    },
    "actions/setup-go": {
        sha: "3041bf56c941b39c61721a86cd11f3bb1338122a",
        version: "v5.2.0",
        displayName: "Go",
        versionFileKey: "go-version-file",
        verifyCommand: "go version",
    },
    "ruby/setup-ruby": {
        sha: "a4effe49ee8ee5b8224aba0bcf7754adb0aeb1e4",
        version: "v1.202.0",
        displayName: "Ruby",
        versionFileKey: "ruby-version",
        verifyCommand: "ruby --version",
    },
    "jdx/mise-action": {
        sha: "146a28175021df8ca24f8ee1828cc2a60f980bd5",
        version: "v3.5.1",
        displayName: "mise",
        verifyCommand: "mise --version",
    },
};

/**
 * Generates a pinned action reference string for use in workflow files.
 * @param action The action name (e.g., "actions/setup-node")
 * @returns Pinned reference string with SHA and version comment, or just the action name if not pinned
 */
export function getPinnedActionReference(action: string): string {
    const pinned = PINNED_ACTIONS[action];
    if (pinned) {
        return `${action}@${pinned.sha}  # ${pinned.version}`;
    }
    return action;
}

/**
 * Gets a human-readable display name for an action.
 * @param action The action name (e.g., "actions/setup-node")
 * @returns Display name (e.g., "Node.js") or the action name if no display name is configured
 */
export function getActionDisplayName(action: string): string {
    const pinned = PINNED_ACTIONS[action];
    return pinned?.displayName || action;
}

/**
 * Gets the 'with' configuration for a setup action based on version file.
 * @param action The action name (e.g., "actions/setup-node")
 * @param versionFile The version file name (e.g., ".nvmrc")
 * @returns Configuration object for the 'with' section, or undefined if not applicable
 */
export function getActionVersionFileWith(
    action: string,
    versionFile: string,
): Record<string, string> | undefined {
    const pinned = PINNED_ACTIONS[action];
    if (!pinned?.versionFileKey) {
        return undefined;
    }

    const withConfig: Record<string, string> = {
        [pinned.versionFileKey]: versionFile,
    };

    if (pinned.defaultWith) {
        Object.assign(withConfig, pinned.defaultWith);
    }

    return withConfig;
}

/**
 * Gets the verification command for an action's runtime.
 * @param action The action name (e.g., "actions/setup-node")
 * @returns Command to verify the runtime, or undefined if not configured
 */
export function getActionVerifyCommand(action: string): string | undefined {
    return PINNED_ACTIONS[action]?.verifyCommand;
}
