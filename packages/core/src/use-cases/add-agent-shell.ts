/**
 * Use case for adding agent-shell to an npm project's `.npmrc` configuration.
 * Enables npm script observability via the agent-shell script-shell shim.
 */

import type { PackageManagerFile } from "../entities/copilot-setup.js";

/**
 * Port for `.npmrc` file operations.
 */
export interface NpmrcGateway {
    /**
     * Reads the content of the `.npmrc` file in the target directory.
     * @returns The file content as a string, or null if the file does not exist.
     */
    readNpmrc(targetDir: string): Promise<string | null>;

    /**
     * Writes content to the `.npmrc` file in the target directory.
     * Creates the file if it does not exist.
     */
    writeNpmrc(targetDir: string, content: string): Promise<void>;
}

/**
 * The script-shell entry added to `.npmrc` to enable agent-shell.
 * Uses a PATH-resolved binary name so it works independently of local node_modules.
 */
export const AGENT_SHELL_NPMRC_ENTRY = "script-shell=agent-shell";

/**
 * Input for the addAgentShell use case.
 */
export interface AddAgentShellInput {
    targetDir: string;
    packageManager: PackageManagerFile;
}

/**
 * Output from the addAgentShell use case.
 */
export interface AddAgentShellOutput {
    wasAdded: boolean;
    alreadyConfigured: boolean;
}

/**
 * Checks whether `.npmrc` content already has an active (non-comment) script-shell entry.
 * Lines starting with `#` or `;` are treated as comments and ignored.
 */
export function hasScriptShellEntry(content: string): boolean {
    return /^\s*script-shell\s*=/m.test(content);
}

/**
 * Adds agent-shell to the project's `.npmrc` if not already configured.
 * Only operates on npm projects.
 */
export async function addAgentShell(
    input: AddAgentShellInput,
    npmrcGateway: NpmrcGateway,
): Promise<AddAgentShellOutput> {
    if (input.packageManager.type !== "npm") {
        return { wasAdded: false, alreadyConfigured: false };
    }

    const existingContent = await npmrcGateway.readNpmrc(input.targetDir);

    if (existingContent !== null && hasScriptShellEntry(existingContent)) {
        return { wasAdded: false, alreadyConfigured: true };
    }

    const newEntry = `${AGENT_SHELL_NPMRC_ENTRY}\n`;

    let updatedContent: string;
    if (existingContent !== null) {
        const separator =
            existingContent.length > 0 && !existingContent.endsWith("\n")
                ? "\n"
                : "";
        updatedContent = `${existingContent}${separator}${newEntry}`;
    } else {
        updatedContent = newEntry;
    }

    await npmrcGateway.writeNpmrc(input.targetDir, updatedContent);

    return { wasAdded: true, alreadyConfigured: false };
}
