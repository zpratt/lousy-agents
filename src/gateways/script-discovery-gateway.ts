/**
 * Gateway for discovering scripts from package.json manifests
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
    type DiscoveredScript,
    determineScriptPhase,
    isScriptMandatory,
} from "../entities/feedback-loop.js";
import { fileExists } from "./file-system-utils.js";

/**
 * Interface for package.json scripts section
 */
interface PackageJson {
    scripts?: Record<string, string>;
    name?: string;
}

/**
 * Gateway interface for discovering scripts
 */
export interface ScriptDiscoveryGateway {
    /**
     * Discovers scripts from package.json in the target directory
     * @param targetDir The directory to search for package.json
     * @returns Array of discovered scripts
     */
    discoverScripts(targetDir: string): Promise<DiscoveredScript[]>;
}

/**
 * File system implementation of script discovery gateway
 */
export class FileSystemScriptDiscoveryGateway
    implements ScriptDiscoveryGateway
{
    async discoverScripts(targetDir: string): Promise<DiscoveredScript[]> {
        const packageJsonPath = join(targetDir, "package.json");

        if (!(await fileExists(packageJsonPath))) {
            return [];
        }

        try {
            const content = await readFile(packageJsonPath, "utf-8");
            const packageJson: PackageJson = JSON.parse(content);

            if (!packageJson.scripts) {
                return [];
            }

            const scripts: DiscoveredScript[] = [];

            for (const [name, command] of Object.entries(packageJson.scripts)) {
                const phase = determineScriptPhase(name, command);
                const isMandatory = isScriptMandatory(phase);

                scripts.push({
                    name,
                    command,
                    phase,
                    isMandatory,
                });
            }

            return scripts;
        } catch {
            // If package.json is malformed or cannot be parsed, return empty array
            return [];
        }
    }
}

/**
 * Creates and returns the default script discovery gateway
 */
export function createScriptDiscoveryGateway(): ScriptDiscoveryGateway {
    return new FileSystemScriptDiscoveryGateway();
}

/**
 * Creates a FeedbackLoopCommandsGateway that discovers mandatory commands from package.json scripts.
 */
export function createFeedbackLoopCommandsGateway(
    scriptGateway?: ScriptDiscoveryGateway,
): { getMandatoryCommands(targetDir: string): Promise<string[]> } {
    const gateway = scriptGateway ?? createScriptDiscoveryGateway();
    return {
        async getMandatoryCommands(targetDir: string) {
            const scripts = await gateway.discoverScripts(targetDir);
            return scripts.filter((s) => s.isMandatory).map((s) => s.name);
        },
    };
}
