/**
 * Gateway for reading and writing `.npmrc` configuration files.
 */

import { writeFile } from "node:fs/promises";
import { type ConsolaInstance, consola } from "consola";
import {
    pathExistsWithinRoot,
    readTextWithinRoot,
    resolveSafePath,
} from "./file-system-utils.js";

const MAX_NPMRC_BYTES = 64 * 1024;

import type { NpmrcGateway } from "../use-cases/add-agent-shell.js";

export type { NpmrcGateway };

/**
 * File system implementation of the NpmrcGateway.
 */
export class FileSystemNpmrcGateway implements NpmrcGateway {
    constructor(
        private readonly logger: ConsolaInstance = consola,
        private readonly dryRun: boolean = false,
    ) {}

    async readNpmrc(targetDir: string): Promise<string | null> {
        if (!(await pathExistsWithinRoot(targetDir, ".npmrc"))) {
            return null;
        }

        return readTextWithinRoot(targetDir, ".npmrc", MAX_NPMRC_BYTES);
    }

    async writeNpmrc(targetDir: string, content: string): Promise<void> {
        const npmrcPath = await resolveSafePath(targetDir, ".npmrc");

        if (this.dryRun) {
            this.logger.info(
                `[DRY-RUN] Would write to: ${npmrcPath}\n${content}`,
            );
            return;
        }

        await writeFile(npmrcPath, content, "utf-8");
    }
}

/**
 * Creates and returns the default NpmrcGateway.
 */
export function createNpmrcGateway(
    logger: ConsolaInstance = consola,
    dryRun = false,
): NpmrcGateway {
    return new FileSystemNpmrcGateway(logger, dryRun);
}
