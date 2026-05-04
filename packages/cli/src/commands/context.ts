import { resolve, sep } from "node:path";
import {
    readFileNoFollow,
    resolveSafePath,
} from "@lousy-agents/core/gateways/file-system-utils.js";
import { createLessonFileGateway } from "@lousy-agents/core/gateways/lesson-file-gateway.js";
import {
    ClaudePreToolUseHookInputSchema,
    ClaudeSessionStartHookInputSchema,
} from "@lousy-agents/core/use-cases/claude-hook-input-schema.js";
import { buildAdditionalContextResponse } from "@lousy-agents/core/use-cases/claude-hook-response.js";
import { LessonContextUseCase } from "@lousy-agents/core/use-cases/lesson-context-use-case.js";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";

function readStdin(): Promise<string> {
    return new Promise((resolve) => {
        if (process.stdin.isTTY) {
            resolve("");
            return;
        }

        const chunks: Buffer[] = [];
        process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
        process.stdin.on("end", () =>
            resolve(Buffer.concat(chunks).toString("utf8")),
        );
        process.stdin.on("error", () => resolve(""));
    });
}

/** Maximum bytes to read per file when building pattern-match contents. */
const FILE_CONTENT_MAX_BYTES = 1_048_576; // 1 MB

/**
 * Reads file contents for the given paths, constrained to rootDir, fail-open —
 * files that cannot be read (missing, outside rootDir, symlinks, too large) are
 * skipped with a warning logged.
 */
async function readFileContents(
    rootDir: string,
    filePaths: readonly string[],
): Promise<ReadonlyMap<string, string>> {
    const contents = new Map<string, string>();
    for (const fp of filePaths) {
        try {
            // resolveSafePath: boundary check + lstat-walks every segment (catches intermediate symlinks)
            const safePath = await resolveSafePath(rootDir, fp);
            const text = await readFileNoFollow(
                safePath,
                FILE_CONTENT_MAX_BYTES,
            );
            contents.set(fp, text);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            consola.warn(`context: skipping unreadable file ${fp}: ${message}`);
        }
    }
    return contents;
}

/**
 * Filters explicit --files paths to those resolving within rootDir using
 * pure path arithmetic (no filesystem access required).
 * Logs a warning and drops each path that escapes rootDir (fail-open).
 */
function filterExplicitFilePaths(
    rootDir: string,
    filePaths: readonly string[],
): string[] {
    const root = resolve(rootDir);
    return filePaths.filter((fp) => {
        const resolved = resolve(root, fp);
        const inRoot =
            resolved.startsWith(`${root}${sep}`) || resolved === root;
        if (!inRoot) {
            consola.warn(
                `context: --files path dropped (escapes rootDir): ${fp}`,
            );
        }
        return inRoot;
    });
}

/** Parses a comma-separated --files string into trimmed, non-empty path tokens. */
function parseExplicitFiles(rawFiles: string): string[] {
    return rawFiles
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
}

export const contextCommand = defineCommand({
    meta: {
        name: "context",
        description:
            "Inject relevant lessons into Claude hooks as additionalContext",
    },
    args: {
        files: {
            type: "string",
            description:
                "Comma-separated list of file paths to match lessons against (PreToolUse dispatch; for debug use — real hook invocations pass paths via stdin)",
            default: "",
        },
    },
    run: async (context: CommandContext) => {
        const rootDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const rawFiles =
            typeof context.args?.files === "string" ? context.args.files : "";

        const gateway = createLessonFileGateway();
        const useCase = new LessonContextUseCase(gateway);

        let hookEventName: "PreToolUse" | "SessionStart" = "SessionStart";
        let filePaths: string[] = [];
        let fromExplicitFiles = false;

        // Always read stdin first (Claude Code pipes hook JSON unconditionally)
        const stdinRaw = await readStdin();
        const trimmedStdin = stdinRaw.trim();

        if (trimmedStdin.length > 0) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(trimmedStdin);
            } catch {
                if (rawFiles.length > 0) {
                    // --files is a debug override: proceed with PreToolUse even when stdin is not valid JSON
                    consola.warn(
                        "context: stdin is not valid JSON; --files provided, switching to PreToolUse dispatch",
                    );
                    hookEventName = "PreToolUse";
                    filePaths = parseExplicitFiles(rawFiles);
                    fromExplicitFiles = true;
                } else {
                    consola.warn(
                        "context: stdin is not valid JSON; falling back to empty additionalContext",
                    );
                    process.stdout.write(
                        buildAdditionalContextResponse({
                            hookEventName: "SessionStart",
                            additionalContext: "",
                        }),
                    );
                    return;
                }
            }

            const preToolResult =
                ClaudePreToolUseHookInputSchema.safeParse(parsed);
            if (preToolResult.success) {
                hookEventName = "PreToolUse";
                // Extract file path from tool_input for real hook invocations,
                // confining it to rootDir to prevent out-of-workspace path leakage.
                const fp = preToolResult.data.tool_input.file_path;
                if (typeof fp === "string" && fp.length > 0) {
                    const root = resolve(rootDir);
                    const resolved = resolve(root, fp);
                    if (
                        resolved.startsWith(`${root}${sep}`) ||
                        resolved === root
                    ) {
                        filePaths = [fp];
                    } else {
                        consola.warn(
                            `context: stdin file_path rejected (escapes rootDir): ${fp}`,
                        );
                    }
                }
                if (rawFiles.length > 0) {
                    // --files overrides stdin paths (debug mode)
                    consola.warn(
                        "context: --files provided alongside PreToolUse stdin; --files path set takes precedence",
                    );
                    filePaths = parseExplicitFiles(rawFiles);
                    fromExplicitFiles = true;
                }
            } else {
                const sessionResult =
                    ClaudeSessionStartHookInputSchema.safeParse(parsed);
                if (sessionResult.success) {
                    hookEventName = "SessionStart";
                    if (rawFiles.length > 0) {
                        // --files is an explicit debug override: always forces PreToolUse
                        // regardless of what the stdin event name says.
                        consola.warn(
                            "context: --files provided alongside SessionStart stdin; switching to PreToolUse dispatch",
                        );
                        hookEventName = "PreToolUse";
                        filePaths = parseExplicitFiles(rawFiles);
                        fromExplicitFiles = true;
                    }
                } else {
                    if (rawFiles.length > 0) {
                        // --files is a debug override: proceed with PreToolUse even when stdin schema is unrecognised
                        consola.warn(
                            "context: stdin did not match any known hook schema; --files provided, switching to PreToolUse dispatch",
                        );
                        hookEventName = "PreToolUse";
                        filePaths = parseExplicitFiles(rawFiles);
                        fromExplicitFiles = true;
                    } else {
                        consola.warn(
                            "context: stdin did not match any known hook schema; falling back to empty additionalContext",
                        );
                        process.stdout.write(
                            buildAdditionalContextResponse({
                                hookEventName: "SessionStart",
                                additionalContext: "",
                            }),
                        );
                        return;
                    }
                }
            }
        } else if (rawFiles.length > 0) {
            // No stdin (TTY / debug invocation) but --files provided → PreToolUse dispatch
            hookEventName = "PreToolUse";
            filePaths = parseExplicitFiles(rawFiles);
            fromExplicitFiles = true;
        }

        if (fromExplicitFiles && filePaths.length > 0) {
            filePaths = filterExplicitFilePaths(rootDir, filePaths);
            // All --files paths were rejected (every path escaped rootDir).
            // For partial filtering (some valid, some dropped), we remain
            // fail-open and continue with the valid subset. When NOTHING
            // survives, signal misconfiguration via exit 1.
            if (filePaths.length === 0) {
                consola.error(
                    "context: all --files paths were rejected (all escaped rootDir); exiting 1",
                );
                process.exitCode = 1;
                return;
            }
        }

        let contextResult: Awaited<ReturnType<typeof useCase.execute>>;
        try {
            const fileContents =
                filePaths.length > 0
                    ? await readFileContents(rootDir, filePaths)
                    : new Map<string, string>();
            contextResult = await useCase.execute({
                rootDir,
                hookEventName,
                filePaths,
                fileContents,
            });
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error);
            consola.warn(
                `context: lesson lookup failed (${message}); continuing with empty context`,
            );
            process.stdout.write(
                buildAdditionalContextResponse({
                    hookEventName,
                    additionalContext: "",
                }),
            );
            return;
        }

        process.stdout.write(
            buildAdditionalContextResponse({
                hookEventName,
                additionalContext: contextResult.additionalContext,
            }),
        );

        for (const err of contextResult.gatewayErrors) {
            consola.warn(
                `context: skipping lesson ${err.filePath}: ${err.reason}`,
            );
        }
    },
});
