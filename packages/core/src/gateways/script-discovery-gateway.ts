/**
 * Gateway for discovering scripts from package.json manifests
 */

import { join } from "node:path";
import { type ConsolaInstance, consola } from "consola";
import { z } from "zod";
import {
    type DiscoveredScript,
    determineScriptPhase,
    isScriptMandatory,
} from "../entities/feedback-loop.js";
import type { FeedbackLoopCommandsGateway } from "../use-cases/analyze-instruction-quality.js";
import type { ScriptDiscoveryGateway } from "../use-cases/discover-feedback-loops.js";
import { readFileNoFollow } from "./file-system-utils.js";

// 1 MB — covers even the largest real-world manifests
const MAX_PACKAGE_JSON_BYTES = 1024 * 1024;

const PackageJsonSchema = z.object({
    scripts: z.record(z.string(), z.string()).optional(),
});

export type { FeedbackLoopCommandsGateway, ScriptDiscoveryGateway };

/**
 * File system implementation of script discovery gateway
 */
export class FileSystemScriptDiscoveryGateway
    implements ScriptDiscoveryGateway
{
    constructor(private readonly logger: ConsolaInstance = consola) {}

    async discoverScripts(targetDir: string): Promise<DiscoveredScript[]> {
        const packageJsonPath = join(targetDir, "package.json");

        let content: string;
        try {
            content = await readFileNoFollow(
                packageJsonPath,
                MAX_PACKAGE_JSON_BYTES,
            );
        } catch (error: unknown) {
            const code =
                error instanceof Error && "code" in error
                    ? (error as { code?: unknown }).code
                    : undefined;
            if (code !== "ENOENT") {
                this.logger.warn(
                    `script-discovery: could not read ${JSON.stringify(packageJsonPath)}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
            return [];
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            if (e instanceof SyntaxError) {
                return [];
            }
            throw e;
        }

        const parseResult = PackageJsonSchema.safeParse(parsed);

        if (!parseResult.success || !parseResult.data.scripts) {
            return [];
        }

        const scripts: DiscoveredScript[] = [];

        for (const [name, command] of Object.entries(
            parseResult.data.scripts,
        )) {
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
): FeedbackLoopCommandsGateway {
    const gateway = scriptGateway ?? createScriptDiscoveryGateway();
    return {
        async getMandatoryCommands(targetDir: string) {
            const scripts = await gateway.discoverScripts(targetDir);
            return scripts.filter((s) => s.isMandatory).map((s) => s.name);
        },
    };
}
