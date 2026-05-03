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
 * silently skipped.
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
        } catch {
            // Fail-open: skip unreadable or out-of-scope files
        }
    }
    return contents;
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
        let toolName: string | undefined;
        let filePaths: string[] = [];

        // Always read stdin first (Claude Code pipes hook JSON unconditionally)
        const stdinRaw = await readStdin();
        const trimmedStdin = stdinRaw.trim();

        if (trimmedStdin.length > 0) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(trimmedStdin);
            } catch {
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

            const preToolResult =
                ClaudePreToolUseHookInputSchema.safeParse(parsed);
            if (preToolResult.success) {
                hookEventName = "PreToolUse";
                toolName = preToolResult.data.tool_name;
                // Extract file path from tool_input for real hook invocations
                const fp = preToolResult.data.tool_input.file_path;
                if (typeof fp === "string" && fp.length > 0) {
                    filePaths = [fp];
                }
                if (rawFiles.length > 0) {
                    // --files overrides stdin paths (debug mode)
                    consola.warn(
                        "context: --files provided alongside PreToolUse stdin; --files path set takes precedence",
                    );
                    filePaths = rawFiles
                        .split(",")
                        .map((f) => f.trim())
                        .filter(Boolean);
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
                        filePaths = rawFiles
                            .split(",")
                            .map((f) => f.trim())
                            .filter(Boolean);
                    }
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
        } else if (rawFiles.length > 0) {
            // No stdin (TTY / debug invocation) but --files provided → PreToolUse dispatch
            hookEventName = "PreToolUse";
            filePaths = rawFiles
                .split(",")
                .map((f) => f.trim())
                .filter(Boolean);
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
                toolName,
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
