/**
 * Gateway for looking up GitHub Actions versions.
 * This module abstracts version lookup to enable future remote API sourcing.
 */

/**
 * Default versions for setup actions (used as fallback)
 */
const DEFAULT_ACTION_VERSIONS: Record<string, string> = {
    "actions/checkout": "v4",
    "actions/setup-node": "v4",
    "actions/setup-python": "v5",
    "actions/setup-java": "v4",
    "actions/setup-ruby": "v1",
    "actions/setup-go": "v5",
    "jdx/mise-action": "v2",
};

/**
 * Interface for action version gateway
 * Allows for different implementations (local, remote API, etc.)
 */
export interface ActionVersionGateway {
    /**
     * Retrieves the version for a given action
     * @param actionName The fully qualified action name (e.g., "actions/setup-node")
     * @returns The version string (e.g., "v4") or undefined if not found
     */
    getVersion(actionName: string): Promise<string | undefined>;

    /**
     * Retrieves versions for multiple actions
     * @param actionNames Array of fully qualified action names
     * @returns Record mapping action names to their versions
     */
    getVersions(actionNames: string[]): Promise<Record<string, string>>;
}

/**
 * Default implementation that uses local default versions.
 * This can be replaced with a remote API implementation in the future.
 */
export class LocalActionVersionGateway implements ActionVersionGateway {
    async getVersion(actionName: string): Promise<string | undefined> {
        // Simulate async lookup (for future remote API compatibility)
        return DEFAULT_ACTION_VERSIONS[actionName];
    }

    async getVersions(actionNames: string[]): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        for (const actionName of actionNames) {
            const version = await this.getVersion(actionName);
            if (version) {
                result[actionName] = version;
            }
        }
        return result;
    }
}

/**
 * Creates and returns the default action version gateway
 */
export function createActionVersionGateway(): ActionVersionGateway {
    return new LocalActionVersionGateway();
}

/**
 * List of known action names for convenience
 */
export const KNOWN_ACTIONS = Object.keys(DEFAULT_ACTION_VERSIONS);
