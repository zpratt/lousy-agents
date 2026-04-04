// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import { z } from "zod/v4";
import { sanitizeForStderr } from "./sanitize.js";
import type { TelemetryDeps } from "./telemetry.js";
import { emitToolUseEvent } from "./telemetry.js";

export interface RecordDeps {
    readStdin: () => Promise<string>;
    writeStderr: (data: string) => void;
    env: Record<string, string | undefined>;
    telemetryDeps: TelemetryDeps;
    getRepositoryRoot: () => string;
}

const TERMINAL_TOOLS = new Set(["bash", "zsh", "ash", "sh"]);

const HookInputSchema = z.object({
    toolName: z.string(),
    toolArgs: z.unknown().optional(),
});

/**
 * Extracts a command string from toolArgs for terminal tools.
 *
 * Parsing chain (mirrors policy-check.ts but observation-only):
 * 1. Check if toolArgs is a string
 * 2. Parse that string as JSON
 * 3. Verify result is a non-null plain object
 * 4. Check for a `command` property
 * 5. Verify `command` is a string
 *
 * Returns the command string on success, or an empty string for any failure.
 */
function extractTerminalCommand(toolArgs: unknown): string {
    // Step 1: toolArgs must be a string
    if (typeof toolArgs !== "string") {
        return "";
    }

    // Step 2: parse as JSON
    let parsedArgs: unknown;
    try {
        parsedArgs = JSON.parse(toolArgs);
    } catch {
        return "";
    }

    // Step 3: must be a non-null plain object
    if (
        parsedArgs === null ||
        typeof parsedArgs !== "object" ||
        Array.isArray(parsedArgs)
    ) {
        return "";
    }

    // Step 4: must have `command` property (reject prototype pollution keys)
    const obj = parsedArgs as Record<string, unknown>;
    if (Object.hasOwn(obj, "__proto__") || Object.hasOwn(obj, "constructor")) {
        return "";
    }
    if (!Object.hasOwn(obj, "command")) {
        return "";
    }

    // Step 5: command must be a string
    if (typeof obj.command !== "string") {
        return "";
    }

    return obj.command;
}

export async function handleRecord(deps: RecordDeps): Promise<void> {
    let rawStdin: string;
    try {
        rawStdin = await deps.readStdin();
    } catch (err) {
        deps.writeStderr(
            `agent-shell: failed to read stdin: ${sanitizeForStderr(err)}\n`,
        );
        process.exitCode = 1;
        return;
    }

    let input: unknown;
    try {
        input = JSON.parse(rawStdin);
    } catch {
        deps.writeStderr("agent-shell: failed to parse stdin as JSON\n");
        process.exitCode = 1;
        return;
    }

    const hookResult = HookInputSchema.safeParse(input);

    if (!hookResult.success) {
        deps.writeStderr(
            "agent-shell: missing or invalid toolName field, skipping telemetry\n",
        );
        return;
    }

    const { toolName, toolArgs } = hookResult.data;

    const command = TERMINAL_TOOLS.has(toolName)
        ? extractTerminalCommand(toolArgs)
        : "";

    try {
        const repoRoot = deps.getRepositoryRoot();
        await emitToolUseEvent(
            {
                tool_name: toolName,
                command,
                env: deps.env,
                projectRoot: repoRoot,
            },
            deps.telemetryDeps,
        );
    } catch (err) {
        deps.writeStderr(
            `agent-shell: telemetry write error: ${sanitizeForStderr(err)}\n`,
        );
    }
}
