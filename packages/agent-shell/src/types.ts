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

export const PolicyConfigSchema = z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).default([]),
});

const HookCommandSchema = z
    .object({
        type: z.literal("command"),
        bash: z.string().optional(),
        powershell: z.string().optional(),
        cwd: z.string().optional(),
        timeoutSec: z.number().positive().optional(),
        env: z.record(z.string(), z.string()).optional(),
    })
    .refine(
        (data) => data.bash !== undefined || data.powershell !== undefined,
        { message: "At least one of 'bash' or 'powershell' must be provided" },
    );

export const HooksConfigSchema = z.object({
    version: z.literal(1),
    hooks: z.object({
        sessionStart: z.array(HookCommandSchema).optional(),
        userPromptSubmitted: z.array(HookCommandSchema).optional(),
        preToolUse: z.array(HookCommandSchema).optional(),
        postToolUse: z.array(HookCommandSchema).optional(),
        sessionEnd: z.array(HookCommandSchema).optional(),
    }),
});

export type ScriptEndEvent = z.infer<typeof ScriptEndEventSchema>;
export type ShimErrorEvent = z.infer<typeof ShimErrorEventSchema>;
export type PolicyDecisionEvent = z.infer<typeof PolicyDecisionEventSchema>;
export type ScriptEvent = z.infer<typeof ScriptEventSchema>;
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
export type HooksConfig = z.infer<typeof HooksConfigSchema>;
