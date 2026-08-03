// biome-ignore-all lint/style/useNamingConvention: Claude Code API uses PascalCase hook event names (PreToolUse) and snake_case handler types (mcp_tool)
/**
 * Zod schemas for the Claude Code hooks configuration format.
 *
 * Lives in entities (Layer 1) so that use cases can import it without
 * violating the dependency rule, mirroring `copilot-hook-schema.ts`.
 *
 * Modelled on https://code.claude.com/docs/en/hooks. Claude Code settings
 * files carry far more than hooks, so the top level is permissive
 * (`.passthrough()`); the `hooks` section itself is strict so that a
 * misspelled event name — which silently never fires — is reported.
 */

import { z } from "zod";

export const MAX_HOOKS_PER_ENTRY = 100;

/**
 * Events that accept a `matcher`. The remainder fire unconditionally, so a
 * missing `matcher` is only worth reporting for the events listed here.
 */
export const MATCHER_SUPPORTING_EVENTS: ReadonlySet<string> = new Set<string>([
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "PermissionDenied",
    "SessionStart",
    "Setup",
    "SessionEnd",
    "Notification",
    "SubagentStart",
    "SubagentStop",
    "PreCompact",
    "PostCompact",
    "ConfigChange",
    "DirectoryAdded",
    "FileChanged",
    "StopFailure",
    "InstructionsLoaded",
    "UserPromptExpansion",
    "Elicitation",
    "ElicitationResult",
]);

/** Fields every handler type accepts regardless of `type`. */
const sharedHandlerFields = {
    if: z.string().optional(),
    timeout: z.number().positive().optional(),
    statusMessage: z.string().optional(),
    once: z.boolean().optional(),
};

/** Regex that allows standard env var names and rejects __proto__ (the prototype-polluting key). */
const ENV_KEY_PATTERN = /^(?!__proto__$)[a-zA-Z_][a-zA-Z0-9_]*$/;

const ClaudeCommandHandlerSchema = z
    .object({
        ...sharedHandlerFields,
        type: z.literal("command"),
        command: z.string().min(1, "Hook command must not be empty"),
        args: z.array(z.string()).optional(),
        shell: z.enum(["bash", "powershell"]).optional(),
        async: z.boolean().optional(),
        asyncRewake: z.boolean().optional(),
    })
    .strict();

const ClaudeHttpHandlerSchema = z
    .object({
        ...sharedHandlerFields,
        type: z.literal("http"),
        url: z.string().min(1, "Hook url must not be empty"),
        headers: z.record(z.string(), z.string()).optional(),
        allowedEnvVars: z
            .array(
                z
                    .string()
                    .regex(
                        ENV_KEY_PATTERN,
                        "Hook allowedEnvVars entry must be a valid identifier (no prototype-polluting keys)",
                    ),
            )
            .optional(),
    })
    .strict();

const ClaudeMcpToolHandlerSchema = z
    .object({
        ...sharedHandlerFields,
        type: z.literal("mcp_tool"),
        server: z.string().min(1, "Hook server must not be empty"),
        tool: z.string().min(1, "Hook tool must not be empty"),
        input: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();

const ClaudePromptHandlerSchema = z
    .object({
        ...sharedHandlerFields,
        type: z.literal("prompt"),
        prompt: z.string().min(1, "Hook prompt must not be empty"),
        model: z.string().optional(),
    })
    .strict();

const ClaudeAgentHandlerSchema = z
    .object({
        ...sharedHandlerFields,
        type: z.literal("agent"),
        prompt: z.string().min(1, "Hook prompt must not be empty"),
        model: z.string().optional(),
    })
    .strict();

/**
 * A single hook handler. Discriminated on `type` so that each handler is
 * validated against its own required fields — an `http` handler is not
 * expected to carry a `command`, and vice versa.
 */
export const ClaudeHookHandlerSchema = z.discriminatedUnion("type", [
    ClaudeCommandHandlerSchema,
    ClaudeHttpHandlerSchema,
    ClaudeMcpToolHandlerSchema,
    ClaudePromptHandlerSchema,
    ClaudeAgentHandlerSchema,
]);

/**
 * A single entry within a hook event array.
 *
 * `matcher` is optional for every event: Claude Code treats an omitted
 * matcher as "match all", and many events accept no matcher at all.
 */
export const ClaudeHookEntrySchema = z
    .object({
        matcher: z.string().optional(),
        hooks: z
            .array(ClaudeHookHandlerSchema)
            .min(1, "Hook entry must include at least one handler")
            .max(MAX_HOOKS_PER_ENTRY),
    })
    .strict();

const hookEventArray = z.array(ClaudeHookEntrySchema);

/**
 * Every hook event Claude Code dispatches, each optional so that configs may
 * use any combination.
 *
 * Spelled out rather than generated from a list so the schema keeps precise
 * inferred types without a type assertion.
 */
const claudeHookEventShape = {
    SessionStart: hookEventArray.optional(),
    Setup: hookEventArray.optional(),
    UserPromptSubmit: hookEventArray.optional(),
    UserPromptExpansion: hookEventArray.optional(),
    PreToolUse: hookEventArray.optional(),
    PermissionRequest: hookEventArray.optional(),
    PermissionDenied: hookEventArray.optional(),
    PostToolUse: hookEventArray.optional(),
    PostToolUseFailure: hookEventArray.optional(),
    PostToolBatch: hookEventArray.optional(),
    Notification: hookEventArray.optional(),
    MessageDisplay: hookEventArray.optional(),
    SubagentStart: hookEventArray.optional(),
    SubagentStop: hookEventArray.optional(),
    TaskCreated: hookEventArray.optional(),
    TaskCompleted: hookEventArray.optional(),
    Stop: hookEventArray.optional(),
    StopFailure: hookEventArray.optional(),
    TeammateIdle: hookEventArray.optional(),
    InstructionsLoaded: hookEventArray.optional(),
    ConfigChange: hookEventArray.optional(),
    CwdChanged: hookEventArray.optional(),
    DirectoryAdded: hookEventArray.optional(),
    FileChanged: hookEventArray.optional(),
    WorktreeCreate: hookEventArray.optional(),
    WorktreeRemove: hookEventArray.optional(),
    PreCompact: hookEventArray.optional(),
    PostCompact: hookEventArray.optional(),
    Elicitation: hookEventArray.optional(),
    ElicitationResult: hookEventArray.optional(),
    SessionEnd: hookEventArray.optional(),
};

export type ClaudeHookEvent = keyof typeof claudeHookEventShape;

/**
 * Every known hook event name.
 *
 * Derived from the schema shape so the two can never drift apart, and used to
 * report the valid set when an unknown event name is encountered.
 */
export const CLAUDE_HOOK_EVENTS: readonly string[] =
    Object.keys(claudeHookEventShape);

/**
 * Zod schema for the hooks section of a Claude Code settings file.
 *
 * Every event is optional — configs may use any combination — but unknown
 * event names are rejected so that typos surface instead of silently
 * never firing.
 */
export const ClaudeHooksConfigSchema = z
    .object({
        hooks: z.object(claudeHookEventShape).strict(),
    })
    .passthrough();

export type ClaudeHookHandler = z.infer<typeof ClaudeHookHandlerSchema>;
export type ClaudeHookEntry = z.infer<typeof ClaudeHookEntrySchema>;
export type ClaudeHooksConfig = z.infer<typeof ClaudeHooksConfigSchema>;
