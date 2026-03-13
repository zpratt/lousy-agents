/**
 * Gateway for reading and writing `.npmrc` configuration files.
 */

import { readFile, writeFile } from "node:fs/promises";
import { consola } from "consola";
import {
    assertFileSizeWithinLimit,
    fileExists,
    resolveSafePath,
} from "./file-system-utils.js";

const MAX_NPMRC_BYTES = 64 * 1024;

/**
 * Port interface for `.npmrc` file operations.
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
     * @param dryRun If true, logs the operation instead of writing the file
     */
    writeNpmrc(
        targetDir: string,
        content: string,
        dryRun?: boolean,
    ): Promise<void>;
}

/**
 * File system implementation of the NpmrcGateway.
 */
export class FileSystemNpmrcGateway implements NpmrcGateway {
    async readNpmrc(targetDir: string): Promise<string | null> {
        const npmrcPath = await resolveSafePath(targetDir, ".npmrc");

        if (!(await fileExists(npmrcPath))) {
            return null;
        }

        await assertFileSizeWithinLimit(
            npmrcPath,
            MAX_NPMRC_BYTES,
            "`.npmrc` file",
        );

        return readFile(npmrcPath, "utf-8");
    }

    async writeNpmrc(
        targetDir: string,
        content: string,
        dryRun = false,
    ): Promise<void> {
        const npmrcPath = await resolveSafePath(targetDir, ".npmrc");

        if (dryRun) {
            consola.info(`[DRY-RUN] Would write to: ${npmrcPath}\n${content}`);
            return;
        }

        await writeFile(npmrcPath, content, "utf-8");
    }
}

/**
 * Creates and returns the default NpmrcGateway.
 */
export function createNpmrcGateway(): NpmrcGateway {
    return new FileSystemNpmrcGateway();
}
