import { isAbsolute, relative, resolve, sep } from "node:path";
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
import { readStdin, STDIN_MAX_BYTES } from "../lib/stdin.js";

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
 * pure path arithmetic (no filesystem access required), and normalizes each
 * accepted path to a workspace-relative form so trigger globs (e.g.
 * `src/**\/*.ts`) match correctly regardless of whether the input was
 * absolute or relative.
 * Logs a warning and drops each path that escapes rootDir or is the root
 * itself (a directory, not a readable file), following fail-open semantics.
 */
function filterExplicitFilePaths(
    rootDir: string,
    filePaths: readonly string[],
): string[] {
    const root = resolve(rootDir);
    return filePaths.flatMap((fp) => {
        const resolved = resolve(root, fp);
        const rel = relative(root, resolved);
        if (rel === "") {
            consola.warn(
                `context: --files path dropped (is the workspace root, not a readable file): ${fp}`,
            );
            return [];
        }
        if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
            consola.warn(
                `context: --files path dropped (escapes rootDir): ${fp}`,
            );
            return [];
        }
        // Normalize to workspace-relative so trigger path globs (e.g. src/**/*.ts)
        // match correctly regardless of whether the input was absolute or relative.
        // path.relative handles cross-platform separator differences correctly.
        return [rel];
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

        // Support test injection via context.data.useCase; fall back to production instance
        const useCase =
            context.data?.useCase instanceof LessonContextUseCase
                ? context.data.useCase
                : new LessonContextUseCase(createLessonFileGateway());

        let hookEventName: "PreToolUse" | "SessionStart" = "SessionStart";
        let filePaths: string[] = [];
        let fromExplicitFiles = false;

        // Always read stdin first (Claude Code pipes hook JSON unconditionally)
        const { text: stdinRaw, capped: stdinCapped } = await readStdin();

        // Fail-open when stdin is oversized and no --files override: emit empty
        // context and return immediately rather than falling through to SessionStart
        // lesson injection (which would contradict the intent of discarding the
        // oversized payload). The warning is emitted here (not inside readStdin)
        // so the message can accurately describe the actual fallback behaviour.
        if (stdinCapped) {
            if (rawFiles.length === 0) {
                consola.warn(
                    `context: stdin exceeds ${STDIN_MAX_BYTES} bytes; discarding oversized input and returning empty context`,
                );
                process.stdout.write(
                    buildAdditionalContextResponse({
                        hookEventName: "PreToolUse",
                        additionalContext: "",
                    }),
                );
                return;
            }
            consola.warn(
                `context: stdin exceeds ${STDIN_MAX_BYTES} bytes; discarding oversized stdin and using --files paths for PreToolUse dispatch`,
            );
        }

        const trimmedStdin = stdinRaw.trim();

        if (trimmedStdin.length > 0) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(trimmedStdin);
            } catch {
                if (rawFiles.length > 0) {
                    // --files is a debug override: proceed with PreToolUse even when stdin is not valid JSON
                    consola.info(
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
                            hookEventName: "PreToolUse",
                            additionalContext: "",
                        }),
                    );
                    return;
                }
            }

            if (!fromExplicitFiles) {
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
                        const rel = relative(root, resolved);
                        if (rel === "") {
                            // file_path points to the workspace root itself — not a
                            // readable file; skip rather than passing "." to the
                            // use case, which would cause an EISDIR on content reads.
                            consola.warn(
                                "context: stdin file_path is the workspace root; skipping",
                            );
                        } else if (
                            rel === ".." ||
                            rel.startsWith(`..${sep}`) ||
                            isAbsolute(rel)
                        ) {
                            consola.warn(
                                `context: stdin file_path rejected (escapes rootDir): ${fp}`,
                            );
                        } else {
                            // Normalize to a workspace-relative path so trigger
                            // path globs (e.g. src/**/*.ts) match correctly
                            // regardless of whether the hook sends an absolute or
                            // relative path. path.relative handles cross-platform
                            // separator differences correctly.
                            filePaths = [rel];
                        }
                    }
                    if (rawFiles.length > 0) {
                        // --files overrides stdin paths (debug mode)
                        consola.info(
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
                            consola.info(
                                "context: --files provided alongside SessionStart stdin; switching to PreToolUse dispatch",
                            );
                            hookEventName = "PreToolUse";
                            filePaths = parseExplicitFiles(rawFiles);
                            fromExplicitFiles = true;
                        }
                    } else {
                        if (rawFiles.length > 0) {
                            // --files is a debug override: proceed with PreToolUse even when stdin schema is unrecognised
                            consola.info(
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
                                    hookEventName: "PreToolUse",
                                    additionalContext: "",
                                }),
                            );
                            return;
                        }
                    }
                }
            }
        } else if (rawFiles.length > 0) {
            // No stdin (TTY / debug invocation) but --files provided → PreToolUse dispatch
            hookEventName = "PreToolUse";
            filePaths = parseExplicitFiles(rawFiles);
            fromExplicitFiles = true;
        }

        if (fromExplicitFiles && filePaths.length === 0) {
            // --files was supplied but parsed to no tokens (e.g. all-whitespace or
            // all-blank entries). Always emit the hook envelope so Claude's hook
            // contract is satisfied, then exit 1 to signal misconfiguration.
            consola.error(
                "context: --files produced no valid paths after parsing; exiting 1",
            );
            process.stdout.write(
                buildAdditionalContextResponse({
                    hookEventName,
                    additionalContext: "",
                }),
            );
            process.exitCode = 1;
            return;
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
                process.stdout.write(
                    buildAdditionalContextResponse({
                        hookEventName,
                        additionalContext: "",
                    }),
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
