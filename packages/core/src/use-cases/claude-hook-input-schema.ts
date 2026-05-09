// biome-ignore-all lint/style/useNamingConvention: Claude hook API uses snake_case field names
import { z } from "zod";

export const ClaudePreToolUseHookInputSchema = z.object({
    hook_event_name: z.literal("PreToolUse"),
    session_id: z.string(),
    tool_name: z.string(),
    tool_input: z
        .object({
            file_path: z.string().optional(),
        })
        .passthrough(),
});

export type ClaudePreToolUseHookInput = z.infer<
    typeof ClaudePreToolUseHookInputSchema
>;

export const ClaudeSessionStartHookInputSchema = z.object({
    hook_event_name: z.literal("SessionStart"),
    session_id: z.string(),
});

export type ClaudeSessionStartHookInput = z.infer<
    typeof ClaudeSessionStartHookInputSchema
>;

export const ClaudeStopHookInputSchema = z.object({
    hook_event_name: z.literal("Stop"),
    session_id: z.string(),
    transcript: z.array(z.unknown()).optional(),
});

export type ClaudeStopHookInput = z.infer<typeof ClaudeStopHookInputSchema>;

export const ClaudeSubagentStopHookInputSchema = z
    .object({
        hook_event_name: z.literal("SubagentStop"),
        session_id: z.string(),
        transcript: z.array(z.unknown()).optional(),
    })
    .passthrough();

export type ClaudeSubagentStopHookInput = z.infer<
    typeof ClaudeSubagentStopHookInputSchema
>;
