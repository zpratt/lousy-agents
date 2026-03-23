/**
 * Zod schemas for the GitHub Copilot hooks configuration format.
 *
 * Lives in entities (Layer 1) so that use cases can import it without
 * violating the dependency rule. The agent-shell package maintains an
 * aligned copy (packages/agent-shell/src/types.ts HooksConfigSchema)
 * because agent-shell is a standalone published binary that cannot
 * depend on @lousy-agents/core.
 */

import { z } from "zod";

export const MAX_HOOKS_PER_EVENT = 100;

/** Regex that allows standard env var names and rejects __proto__ (the prototype-polluting key). */
const ENV_KEY_PATTERN = /^(?!__proto__$)[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Zod schema for a single GitHub Copilot hook command entry.
 */
export const CopilotHookCommandSchema = z
    .object({
        type: z.literal("command"),
        bash: z
            .string()
            .min(1, "Hook bash command must not be empty")
            .optional(),
        powershell: z
            .string()
            .min(1, "Hook PowerShell command must not be empty")
            .optional(),
        cwd: z.string().optional(),
        timeoutSec: z.number().positive().optional(),
        env: z
            .record(
                z
                    .string()
                    .regex(
                        ENV_KEY_PATTERN,
                        "Hook env key must be a valid identifier (no prototype-polluting keys)",
                    ),
                z.string(),
            )
            .optional(),
    })
    .strict()
    .refine((data) => Boolean(data.bash) || Boolean(data.powershell), {
        message:
            "At least one of 'bash' or 'powershell' must be provided and non-empty",
    });

const hookArray = z.array(CopilotHookCommandSchema).max(MAX_HOOKS_PER_EVENT);

/**
 * Zod schema for the GitHub Copilot hooks configuration file.
 * All hook event arrays are optional — configs may use any combination of events.
 */
export const CopilotHooksConfigSchema = z
    .object({
        version: z.literal(1),
        hooks: z
            .object({
                sessionStart: hookArray.optional(),
                userPromptSubmitted: hookArray.optional(),
                preToolUse: hookArray.optional(),
                postToolUse: hookArray.optional(),
                sessionEnd: hookArray.optional(),
            })
            .strict(),
    })
    .strict();

export type CopilotHookCommand = z.infer<typeof CopilotHookCommandSchema>;
export type CopilotHooksConfig = z.infer<typeof CopilotHooksConfigSchema>;
