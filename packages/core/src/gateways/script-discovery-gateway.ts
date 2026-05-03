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
    constructor(logger?: ConsolaInstance) {
        this.logger = logger ?? consola;
    }

    private readonly logger: ConsolaInstance;

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
                    `script-discovery: could not read ${JSON.stringify(packageJsonPath)}: ${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
                );
            }
            return [];
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            if (e instanceof SyntaxError) {
                this.logger.warn(
                    `script-discovery: ${JSON.stringify(packageJsonPath)} contains invalid JSON — ${JSON.stringify(e.message)}`,
                );
                return [];
            }
            throw e;
        }

        const parseResult = PackageJsonSchema.safeParse(parsed);

        if (!parseResult.success) {
            this.logger.warn(
                `script-discovery: ${JSON.stringify(packageJsonPath)} has an unexpected structure — scripts field must be a record of strings`,
            );
            return [];
        }

        if (!parseResult.data.scripts) {
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
export function createScriptDiscoveryGateway(
    logger?: ConsolaInstance,
): ScriptDiscoveryGateway {
    return new FileSystemScriptDiscoveryGateway(logger);
}

/**
 * Creates a FeedbackLoopCommandsGateway that discovers mandatory commands from package.json scripts.
 *
 * @param scriptGateway - Optional gateway implementation. If omitted, a default
 *   `FileSystemScriptDiscoveryGateway` is created using `logger`.
 * @param logger - Optional logger for the default gateway. Only used when
 *   `scriptGateway` is omitted; if a custom `scriptGateway` is supplied, its
 *   own logger configuration applies and this parameter is ignored.
 */
export function createFeedbackLoopCommandsGateway(
    scriptGateway?: ScriptDiscoveryGateway,
    logger?: ConsolaInstance,
): FeedbackLoopCommandsGateway {
    const gateway = scriptGateway ?? createScriptDiscoveryGateway(logger);
    return {
        async getMandatoryCommands(targetDir: string) {
            const scripts = await gateway.discoverScripts(targetDir);
            return scripts.filter((s) => s.isMandatory).map((s) => s.name);
        },
    };
}
