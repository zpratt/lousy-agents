/**
 * Gateway for discovering scripts from package.json manifests
 */

import { join } from "node:path";
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

// Re-export port types for consumers
export type { FeedbackLoopCommandsGateway, ScriptDiscoveryGateway };

/**
 * File system implementation of script discovery gateway
 */
export class FileSystemScriptDiscoveryGateway
    implements ScriptDiscoveryGateway
{
    async discoverScripts(targetDir: string): Promise<DiscoveredScript[]> {
        const packageJsonPath = join(targetDir, "package.json");

        // readFileNoFollow combines O_NOFOLLOW + fstat size check + read on the same fd,
        // eliminating both the fileExists TOCTOU window and symlink attacks.
        // ENOENT → no package.json present; return [].
        // Size or symlink errors propagate to the caller.
        let content: string;
        try {
            content = await readFileNoFollow(
                packageJsonPath,
                MAX_PACKAGE_JSON_BYTES,
            );
        } catch (error) {
            if (
                error instanceof Error &&
                "code" in error &&
                (error as NodeJS.ErrnoException).code === "ENOENT"
            ) {
                return [];
            }
            throw error;
        }

        try {
            const parseResult = PackageJsonSchema.safeParse(
                JSON.parse(content),
            );

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
        } catch (error) {
            if (error instanceof SyntaxError) {
                // Malformed JSON — not a fatal error; report no scripts found
                return [];
            }
            throw error;
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
): FeedbackLoopCommandsGateway {
    const gateway = scriptGateway ?? createScriptDiscoveryGateway();
    return {
        async getMandatoryCommands(targetDir: string) {
            const scripts = await gateway.discoverScripts(targetDir);
            return scripts.filter((s) => s.isMandatory).map((s) => s.name);
        },
    };
}
