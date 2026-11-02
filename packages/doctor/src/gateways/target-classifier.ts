import {
    classifyImportTarget,
    type ImportTargetClassification,
} from "@lousy-agents/core/gateways/import-target-classifier.js";
import type { NoFollowFsPort } from "@lousy-agents/core/gateways/read-regular-file-no-follow.js";
import { DEFAULT_MAX_FILE_BYTES } from "@lousy-agents/core/lib/instruction-import-expand.js";
import { limitConcurrency } from "../lib/limit-concurrency.js";
import type { ClassifyTarget } from "./edge-resolution.js";

/**
 * Targets checked at once. Every check opens a file, so the limit keeps the
 * scan well under the process's descriptor limit however many imports the
 * repository holds.
 */
export const MAX_CONCURRENT_TARGET_CHECKS = 64;

export interface TargetClassifierOptions {
    /** The file system the readability check opens files with */
    readonly fs?: NoFollowFsPort;
    /** Targets checked at once; defaults to MAX_CONCURRENT_TARGET_CHECKS */
    readonly maxConcurrent?: number;
}

/**
 * Classifies import targets with the rules lint uses: inside the repository,
 * a regular file, a single hard link, within the size cap.
 *
 * A target is checked once however many imports name it, and at most a fixed
 * number are checked at a time, so a file full of imports costs work in
 * proportion to the distinct files it names and cannot exhaust descriptors.
 *
 * @param rootReal Real (symlink-free) path of the repository root
 */
export function createTargetClassifier(
    rootReal: string,
    options: TargetClassifierOptions = {},
): ClassifyTarget {
    const limit = limitConcurrency(
        options.maxConcurrent ?? MAX_CONCURRENT_TARGET_CHECKS,
    );
    const classified = new Map<string, Promise<ImportTargetClassification>>();

    return (absolutePath) => {
        const known = classified.get(absolutePath);
        if (known !== undefined) {
            return known;
        }
        const started = limit(() =>
            classifyImportTarget(
                rootReal,
                absolutePath,
                DEFAULT_MAX_FILE_BYTES,
                { fs: options.fs },
            ),
        );
        classified.set(absolutePath, started);
        return started;
    };
}
