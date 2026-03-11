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

export const ScriptEventSchema = z.discriminatedUnion("event", [
    ScriptEndEventSchema,
    ShimErrorEventSchema,
]);

export type ScriptEndEvent = z.infer<typeof ScriptEndEventSchema>;
export type ShimErrorEvent = z.infer<typeof ShimErrorEventSchema>;
export type ScriptEvent = z.infer<typeof ScriptEventSchema>;
