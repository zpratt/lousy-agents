import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
    assertPathHasNoSymbolicLinks,
    readFileNoFollow,
} from "./file-system-utils.js";

export interface InitHooksConfig {
    readonly addSessionStart: boolean;
    readonly force: boolean;
}

export interface InitHooksResult {
    readonly written: readonly string[];
    readonly skipped: readonly string[];
}

export interface InitHooksConfigGatewayPort {
    initHooks(
        rootDir: string,
        config: InitHooksConfig,
    ): Promise<InitHooksResult>;
}

const CLAUDE_SETTINGS_PATH = join(".claude", "settings.json");

/**
 * PreToolUse hooks for Edit and Write tools only.
 * File paths are NOT passed as shell arguments — Claude Code pipes the hook
 * JSON (including tool_input.file_path) to the command via stdin.
 */
const PRE_TOOL_USE_HOOKS = [
    {
        matcher: "Edit",
        hooks: [
            {
                type: "command",
                command: "npx lousy-agents context",
            },
        ],
    },
    {
        matcher: "Write",
        hooks: [
            {
                type: "command",
                command: "npx lousy-agents context",
            },
        ],
    },
];

const SESSION_START_HOOKS = [
    {
        hooks: [
            {
                type: "command",
                command: "npx lousy-agents context",
            },
        ],
    },
];

const STOP_HOOKS = [
    {
        hooks: [
            {
                type: "command",
                command: "npx lousy-agents capture",
            },
        ],
    },
];

const SUBAGENT_STOP_HOOKS = [
    {
        hooks: [
            {
                type: "command",
                command: "npx lousy-agents capture",
            },
        ],
    },
];

function hasPrototypePollutionKey(obj: unknown, depth = 0): boolean {
    if (depth > 20) return false;
    if (obj === null || typeof obj !== "object") return false;
    const DangerousKeys = new Set(["__proto__", "constructor", "prototype"]);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (DangerousKeys.has(key)) return true;
        if (
            hasPrototypePollutionKey(
                (obj as Record<string, unknown>)[key],
                depth + 1,
            )
        )
            return true;
    }
    return false;
}

function safeJoin(rootDir: string, relativePath: string): string {
    const resolved = resolve(rootDir, relativePath);
    const root = resolve(rootDir);
    if (!resolved.startsWith(`${root}${sep}`) && resolved !== root) {
        throw new Error(
            `Resolved path is outside target directory: ${relativePath}`,
        );
    }
    return resolved;
}

export class InitHooksConfigGateway implements InitHooksConfigGatewayPort {
    async initHooks(
        rootDir: string,
        config: InitHooksConfig,
    ): Promise<InitHooksResult> {
        const written: string[] = [];
        const skipped: string[] = [];

        const realRootDir = await realpath(rootDir);
        const settingsPath = safeJoin(realRootDir, CLAUDE_SETTINGS_PATH);
        const claudeDir = join(realRootDir, ".claude");

        // Reject symlinks on .claude/settings.json and all ancestor segments
        await assertPathHasNoSymbolicLinks(realRootDir, settingsPath);

        let existing: Record<string, unknown> = {};
        try {
            const raw = await readFileNoFollow(settingsPath, 1_048_576);
            const parsed: unknown = JSON.parse(raw);
            if (
                parsed !== null &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
            ) {
                if (hasPrototypePollutionKey(parsed)) {
                    throw new Error(
                        "Settings file contains dangerous prototype keys",
                    );
                }
                existing = parsed as Record<string, unknown>;
            }
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code === "ENOENT" || code === "ENOTDIR") {
                    existing = {};
                } else {
                    throw error;
                }
            } else if (
                error instanceof SyntaxError ||
                (error instanceof Error &&
                    error.message ===
                        "Settings file contains dangerous prototype keys")
            ) {
                throw error;
            } else if (error instanceof Error) {
                throw error;
            }
        }

        const rawHooks = existing.hooks;
        const existingHooks: Record<string, unknown> =
            rawHooks !== null &&
            typeof rawHooks === "object" &&
            !Array.isArray(rawHooks)
                ? (rawHooks as Record<string, unknown>)
                : {};

        const alreadyHasPreToolUse =
            "PreToolUse" in existingHooks && !config.force;
        const alreadyHasStop = "Stop" in existingHooks && !config.force;
        const alreadyHasSubagentStop =
            "SubagentStop" in existingHooks && !config.force;
        const alreadyHasSessionStart =
            config.addSessionStart &&
            "SessionStart" in existingHooks &&
            !config.force;

        const allAlreadyPresent =
            alreadyHasPreToolUse &&
            alreadyHasStop &&
            alreadyHasSubagentStop &&
            (!config.addSessionStart || alreadyHasSessionStart);

        if (allAlreadyPresent) {
            skipped.push(settingsPath);
            return { written, skipped };
        }

        const updatedHooks: Record<string, unknown> = { ...existingHooks };

        if (!alreadyHasPreToolUse) {
            updatedHooks.PreToolUse = PRE_TOOL_USE_HOOKS;
        }

        if (!alreadyHasStop) {
            updatedHooks.Stop = STOP_HOOKS;
        }

        if (!alreadyHasSubagentStop) {
            updatedHooks.SubagentStop = SUBAGENT_STOP_HOOKS;
        }

        if (config.addSessionStart && !alreadyHasSessionStart) {
            updatedHooks.SessionStart = SESSION_START_HOOKS;
        }

        const updatedSettings: Record<string, unknown> = {
            ...existing,
            hooks: updatedHooks,
        };

        const content = `${JSON.stringify(updatedSettings, null, 2)}\n`;

        await mkdir(claudeDir, { recursive: true });

        const tmpPath = `${settingsPath}.tmp`;

        // Write the temp file without following symlinks to prevent a
        // pre-created symlink from redirecting the write to an arbitrary path.
        // O_NOFOLLOW is available on all targeted platforms (Linux/macOS/BSD).
        // On platforms that lack it (e.g., Windows), we fall back to an
        // explicit lstat check, accepting the narrow TOCTOU window.
        const hasNoFollow =
            typeof constants.O_NOFOLLOW === "number" &&
            constants.O_NOFOLLOW !== 0;

        if (hasNoFollow) {
            const openFlags =
                constants.O_WRONLY |
                constants.O_CREAT |
                constants.O_TRUNC |
                constants.O_NOFOLLOW;

            let tmpFileHandle: Awaited<ReturnType<typeof open>>;
            try {
                tmpFileHandle = await open(tmpPath, openFlags);
            } catch (error: unknown) {
                if (
                    error instanceof Error &&
                    "code" in error &&
                    error.code === "ELOOP"
                ) {
                    throw new Error(
                        `Symlinks are not allowed for temp path: ${JSON.stringify(tmpPath)}`,
                    );
                }
                throw error;
            }
            try {
                await tmpFileHandle.writeFile(content, "utf8");
            } finally {
                await tmpFileHandle.close();
            }
        } else {
            // Fallback: lstat-based symlink check before write (accepts narrow TOCTOU)
            try {
                const tmpStat = await lstat(tmpPath);
                if (tmpStat.isSymbolicLink()) {
                    throw new Error(
                        `Symlinks are not allowed for temp path: ${JSON.stringify(tmpPath)}`,
                    );
                }
            } catch (error: unknown) {
                if (
                    !(
                        error instanceof Error &&
                        "code" in error &&
                        (error as NodeJS.ErrnoException).code === "ENOENT"
                    )
                ) {
                    throw error;
                }
                // ENOENT: temp file doesn't exist yet — safe to create
            }
            const tmpFileHandle = await open(
                tmpPath,
                constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC,
            );
            try {
                await tmpFileHandle.writeFile(content, "utf8");
            } finally {
                await tmpFileHandle.close();
            }
        }
        await rename(tmpPath, settingsPath);

        written.push(settingsPath);
        return { written, skipped };
    }
}

export function createInitHooksConfigGateway(): InitHooksConfigGatewayPort {
    return new InitHooksConfigGateway();
}
