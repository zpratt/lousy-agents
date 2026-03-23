// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import { z } from "zod/v4";

export const SCHEMA_VERSION = 1;

const baseFields = {
    v: z.literal(1),
    session_id: z.string(),
    command: z.string(),
    actor: z.string(),
    timestamp: z.string(),
    env: z.record(z.string(), z.string()),
    tags: z.record(z.string(), z.string()),
};

export const ScriptEndEventSchema = z
    .object({
        ...baseFields,
        event: z.literal("script_end"),
        script: z.string().optional(),
        package: z.string().optional(),
        package_version: z.string().optional(),
        exit_code: z.number().int(),
        signal: z.string().nullable(),
        duration_ms: z.number(),
    })
    .strict();

export const ShimErrorEventSchema = z
    .object({
        ...baseFields,
        event: z.literal("shim_error"),
    })
    .strict();

export const PolicyDecisionEventSchema = z
    .object({
        ...baseFields,
        event: z.literal("policy_decision"),
        decision: z.enum(["allow", "deny"]),
        matched_rule: z.string().nullable(),
    })
    .strict();

export const ScriptEventSchema = z.discriminatedUnion("event", [
    ScriptEndEventSchema,
    ShimErrorEventSchema,
    PolicyDecisionEventSchema,
]);

const MAX_POLICY_RULES = 10_000;
const MAX_RULE_LENGTH = 1024;

const policyRuleArray = z
    .array(z.string().max(MAX_RULE_LENGTH))
    .max(MAX_POLICY_RULES);

export const PolicyConfigSchema = z
    .object({
        allow: policyRuleArray.optional(),
        deny: policyRuleArray.default(() => []),
    })
    .strict();

// NOTE: This schema mirrors CopilotHookCommandSchema in @lousy-agents/core
// (packages/core/src/entities/copilot-hook-schema.ts). Keep them aligned.
// agent-shell cannot import from core since it is a standalone published binary.

const MAX_HOOKS_PER_EVENT = 100;

/** Regex that allows standard env var names and rejects __proto__ (the prototype-polluting key). */
const ENV_KEY_PATTERN = /^(?!__proto__$)[a-zA-Z_][a-zA-Z0-9_]*$/;

const HookCommandSchema = z
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

const hookArray = z.array(HookCommandSchema).max(MAX_HOOKS_PER_EVENT);

export const HooksConfigSchema = z
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

export type ScriptEndEvent = z.infer<typeof ScriptEndEventSchema>;
export type ShimErrorEvent = z.infer<typeof ShimErrorEventSchema>;
export type PolicyDecisionEvent = z.infer<typeof PolicyDecisionEventSchema>;
export type ScriptEvent = z.infer<typeof ScriptEventSchema>;
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
export type HooksConfig = z.infer<typeof HooksConfigSchema>;
