import { buildCapturePrompt } from "@lousy-agents/core/use-cases/capture-prompt-use-case.js";
import {
    ClaudeStopHookInputSchema,
    ClaudeSubagentStopHookInputSchema,
} from "@lousy-agents/core/use-cases/claude-hook-input-schema.js";
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

export const captureCommand = defineCommand({
    meta: {
        name: "capture",
        description:
            "Generate a lesson capture prompt for Stop/SubagentStop Claude hooks",
    },
    run: async (_context: CommandContext) => {
        const stdinRaw = await readStdin();
        const trimmed = stdinRaw.trim();

        if (trimmed.length === 0) {
            consola.warn(
                "capture: no hook input provided via stdin; nothing to capture",
            );
            return;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            consola.warn(
                "capture: stdin is not valid JSON; nothing to capture",
            );
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

        consola.warn(
            "capture: stdin did not match Stop or SubagentStop hook schema; nothing to capture",
        );
    },
});
