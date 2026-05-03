/**
 * Directory path validation for the public lint API.
 *
 * Validates user-supplied directory paths by rejecting unsafe inputs
 * (control characters, path traversal, null bytes) and canonicalizing
 * the path via `realpath()` for cross-platform compatibility.
 */

import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { LintValidationError } from "./lint-errors.js";

function isControlCharacter(code: number): boolean {
    if (code >= 0x00 && code <= 0x1f) return true;
    if (code === 0x7f) return true;
    if (code >= 0x80 && code <= 0x9f) return true;
    if (code === 0x2028 || code === 0x2029) return true;
    if (code >= 0x202a && code <= 0x202e) return true;
    if (code >= 0x2066 && code <= 0x2069) return true;
    return false;
}

function containsControlCharacters(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        if (isControlCharacter(value.charCodeAt(i))) {
            return true;
        }
    }
    return false;
}

function sanitizeForErrorMessage(value: string): string {
    return JSON.stringify(value);
}

/**
 * Detects path traversal segments in a user-supplied directory string.
 *
 * On Windows, both '/' and '\' are path separators, so the check splits on
 * both. On POSIX, '\' is a valid filename character (not a separator), so only
 * '/' is used as the split boundary to avoid false-rejecting legitimate paths
 * whose names contain backslashes.
 */
function hasPathTraversalSegment(
    directory: string,
    platform = process.platform,
): boolean {
    const separator = platform === "win32" ? /[\\/]/ : "/";
    return directory.split(separator).includes("..");
}

/**
 * Validates a user-supplied directory path for safety and existence.
 *
 * Rejects paths that contain control characters (ASCII C0/C1, Unicode
 * bidirectional overrides, line/paragraph separators), path traversal
 * segments, or that do not resolve to an existing directory. Returns
 * the canonicalized absolute path (all symlinks resolved) so downstream
 * code always operates on real paths.
 *
 * @param directory - The path to validate.
 * @param platform - The platform identifier used for path-separator detection.
 *   Defaults to `process.platform`. Overridable for cross-platform unit tests
 *   so that the Windows (`\`) and POSIX (`/`-only) traversal branches can be
 *   exercised on any host OS.
 * @throws {LintValidationError} If the path is empty, contains control
 *   characters, traversal segments, does not exist, or is not a directory.
 */
export async function validateDirectory(
    directory: string,
    platform = process.platform,
): Promise<string> {
    if (directory.length === 0) {
        throw new LintValidationError("directory must not be empty");
    }

    const safeDir = sanitizeForErrorMessage(directory);

    if (containsControlCharacters(directory)) {
        throw new LintValidationError(
            `Invalid directory path (contains control characters): ${safeDir}`,
        );
    }

    if (hasPathTraversalSegment(directory, platform)) {
        throw new LintValidationError(
            `Invalid directory path (path traversal detected): ${safeDir}`,
        );
    }

    const resolved = resolve(directory);

    let canonical: string;
    try {
        canonical = await realpath(resolved);
    } catch (error: unknown) {
        if (error instanceof Error && "code" in error) {
            if (error.code === "ENOENT") {
                throw new LintValidationError(
                    `Directory does not exist: ${safeDir}`,
                );
            }
            if (error.code === "ENOTDIR") {
                throw new LintValidationError(
                    `Path is not a directory: ${safeDir}`,
                );
            }
        }
        throw error;
    }

    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
        stats = await lstat(canonical);
    } catch (error: unknown) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            throw new LintValidationError(
                `Directory does not exist: ${safeDir}`,
            );
        }
        throw error;
    }

    if (!stats.isDirectory()) {
        throw new LintValidationError(`Path is not a directory: ${safeDir}`);
    }

    return canonical;
}
