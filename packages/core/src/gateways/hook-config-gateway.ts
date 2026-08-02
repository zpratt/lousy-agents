/**
 * Gateway for hook configuration file system operations.
 * Discovers hook config files for GitHub Copilot and Claude Code.
 */

import { join } from "node:path";
import type { DiscoveredHookFile, HookPlatform } from "../entities/hook.js";
import { hookConfigPaths } from "../lib/agentic-location-matchers.js";
import type { HookConfigLintGateway } from "../use-cases/lint-hook-config.js";
import { readFileNoFollow, resolveSafePath } from "./file-system-utils.js";

/** Maximum hook config file size: 1 MB */
const MAX_CONFIG_FILE_BYTES = 1_048_576;

/** Matches the Copilot hook key `"preToolUse":` to detect hook section presence */
const COPILOT_HOOK_PATTERN = /"preToolUse"\s*:/;

/** Matches the Claude hook key `"PreToolUse":` to detect hook section presence */
const CLAUDE_HOOK_PATTERN = /"PreToolUse"\s*:/;

/** Catalog hook config paths converted to OS-native relative paths. */
const HOOK_CONFIG_PATHS = hookConfigPaths().map((entry) => ({
    relativePath: join(...entry.relativePath.split("/")),
    platform: entry.platform,
}));

/**
 * File system implementation of the hook config lint gateway.
 */
export class FileSystemHookConfigGateway implements HookConfigLintGateway {
    async discoverHookFiles(targetDir: string): Promise<DiscoveredHookFile[]> {
        const discovered: DiscoveredHookFile[] = [];

        for (const config of HOOK_CONFIG_PATHS) {
            let safePath: string;
            try {
                safePath = await resolveSafePath(
                    targetDir,
                    config.relativePath,
                );
            } catch (error: unknown) {
                if (
                    error instanceof Error &&
                    "code" in error &&
                    (error.code === "ENOENT" || error.code === "ENOTDIR")
                ) {
                    continue;
                }
                if (
                    error instanceof Error &&
                    (error.message.startsWith(
                        "Resolved path is outside target directory:",
                    ) ||
                        error.message.startsWith(
                            "Path contains symbolic link:",
                        ))
                ) {
                    continue;
                }
                throw error;
            }

            let content: string;
            try {
                content = await readFileNoFollow(
                    safePath,
                    MAX_CONFIG_FILE_BYTES,
                );
            } catch (error: unknown) {
                if (
                    error instanceof Error &&
                    "code" in error &&
                    (error.code === "ENOENT" || error.code === "ENOTDIR")
                ) {
                    continue;
                }
                if (
                    error instanceof Error &&
                    error.message.startsWith("Symlinks are not allowed")
                ) {
                    continue;
                }
                if (
                    error instanceof Error &&
                    error.message.includes("exceeds size limit")
                ) {
                    continue;
                }
                throw error;
            }

            if (this.mayContainHookSection(content, config.platform)) {
                discovered.push({
                    filePath: safePath,
                    platform: config.platform,
                });
            }
        }

        return discovered;
    }

    async readFileContent(filePath: string): Promise<string> {
        return readFileNoFollow(filePath, MAX_CONFIG_FILE_BYTES);
    }

    /**
     * Lightweight heuristic to check if a file may contain a pre-tool-use hooks section.
     * Uses substring search rather than JSON.parse so that files with invalid JSON are
     * still discovered and surfaced as `hook/invalid-json` diagnostics by the use case.
     */
    private mayContainHookSection(
        content: string,
        platform: HookPlatform,
    ): boolean {
        if (platform === "copilot") {
            return COPILOT_HOOK_PATTERN.test(content);
        }
        return CLAUDE_HOOK_PATTERN.test(content);
    }
}

/**
 * Creates and returns the default hook config lint gateway.
 */
export function createHookConfigGateway(): HookConfigLintGateway {
    return new FileSystemHookConfigGateway();
}
