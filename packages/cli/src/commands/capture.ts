import { buildCapturePrompt } from "@lousy-agents/core/use-cases/capture-prompt-use-case.js";
import {
    ClaudeStopHookInputSchema,
    ClaudeSubagentStopHookInputSchema,
} from "@lousy-agents/core/use-cases/claude-hook-input-schema.js";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { readStdin, STDIN_MAX_BYTES } from "../lib/stdin.js";

/** Minimal logger interface required by this command. */
interface CaptureLogger {
    warn: (...args: unknown[]) => void;
}

function isCaptureLogger(value: unknown): value is CaptureLogger {
    return (
        value !== null &&
        typeof value === "object" &&
        typeof (value as Record<string, unknown>).warn === "function"
    );
}

export const captureCommand = defineCommand({
    meta: {
        name: "capture",
        description:
            "Generate a lesson capture prompt for Stop/SubagentStop Claude hooks",
    },
    run: async (context: CommandContext) => {
        const logger: CaptureLogger = isCaptureLogger(context.data?.logger)
            ? context.data.logger
            : consola;

        const { text: stdinRaw, capped } = await readStdin();

        if (capped) {
            logger.warn(
                `capture: stdin exceeds ${STDIN_MAX_BYTES} bytes; discarding input`,
            );
            return;
        }

        const trimmed = stdinRaw.trim();

        if (trimmed.length === 0) {
            logger.warn(
                "capture: no hook input provided via stdin; nothing to capture",
            );
            return;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            logger.warn("capture: stdin is not valid JSON; nothing to capture");
            return;
        }

        const stopResult = ClaudeStopHookInputSchema.safeParse(parsed);
        if (stopResult.success) {
            const { prompt } = buildCapturePrompt({ hookEventName: "Stop" });
            process.stdout.write(prompt);
            return;
        }

        const subagentResult =
            ClaudeSubagentStopHookInputSchema.safeParse(parsed);
        if (subagentResult.success) {
            const { prompt } = buildCapturePrompt({
                hookEventName: "SubagentStop",
            });
            process.stdout.write(prompt);
            return;
        }

        logger.warn(
            "capture: stdin did not match Stop or SubagentStop hook schema; nothing to capture",
        );
    },
});
