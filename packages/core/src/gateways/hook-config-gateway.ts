/**
 * Gateway for hook configuration file system operations.
 * Discovers hook config files for GitHub Copilot and Claude Code.
 */

import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DiscoveredHookFile, HookPlatform } from "../entities/hook.js";
import type { HookConfigLintGateway } from "../use-cases/lint-hook-config.js";
import {
    assertFileSizeWithinLimit,
    fileExists,
    resolveSafePath,
} from "./file-system-utils.js";

/** Maximum hook config file size: 1 MB */
const MAX_CONFIG_FILE_BYTES = 1_048_576;

/** Matches the Copilot hook key `"preToolUse":` to detect hook section presence */
const COPILOT_HOOK_PATTERN = /"preToolUse"\s*:/;

/** Matches the Claude hook key `"PreToolUse":` to detect hook section presence */
const CLAUDE_HOOK_PATTERN = /"PreToolUse"\s*:/;

/**
 * Hook configuration file locations to search.
 */
const HOOK_CONFIG_PATHS: ReadonlyArray<{
    relativePath: string;
    platform: "copilot" | "claude";
}> = [
    {
        relativePath: join(".github", "hooks", "agent-shell", "hooks.json"),
        platform: "copilot",
    },
    {
        relativePath: join(".claude", "settings.json"),
        platform: "claude",
    },
    {
        relativePath: join(".claude", "settings.local.json"),
        platform: "claude",
    },
];

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
            } catch {
                continue;
            }

            if (!(await fileExists(safePath))) {
                continue;
            }

            const stats = await lstat(safePath);
            if (stats.isSymbolicLink()) {
                continue;
            }

            try {
                await assertFileSizeWithinLimit(
                    safePath,
                    MAX_CONFIG_FILE_BYTES,
                    `Hook config ${config.relativePath}`,
                );
            } catch {
                continue;
            }

            const content = await readFile(safePath, "utf-8");

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
        const stats = await lstat(filePath);
        if (stats.isSymbolicLink()) {
            throw new Error(`Symlinks are not allowed: ${filePath}`);
        }
        await assertFileSizeWithinLimit(
            filePath,
            MAX_CONFIG_FILE_BYTES,
            `Hook config ${filePath}`,
        );
        return readFile(filePath, "utf-8");
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
