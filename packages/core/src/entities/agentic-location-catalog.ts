/**
 * Canonical catalog of agentic construct locations shared by lint and doctor.
 * Pure data only — no filesystem I/O.
 */

import type { InstructionFileFormat } from "./instruction-quality.js";

export type AgenticConstructType =
    | "instruction"
    | "skill"
    | "agent"
    | "subagent"
    | "mcp-server"
    | "plugin"
    | "hook";

export type LintDiscoveryTarget =
    | "skills"
    | "agents"
    | "subagents"
    | "hooks"
    | "instructions"
    | "none";

export type AgenticHarnessHint =
    | "claude"
    | "copilot"
    | "codex"
    | "antigravity"
    | "hermes"
    | "crush"
    | "pi"
    | "shared";

export type CatalogMatchKind = "exact" | "directory-prefix";

/**
 * A single catalogued agentic location.
 * Paths are repo-relative with forward slashes and no trailing slash.
 */
export interface AgenticLocationEntry {
    readonly id: string;
    readonly path: string;
    readonly matchKind: CatalogMatchKind;
    readonly primaryConstruct: AgenticConstructType;
    readonly secondaryConstructs?: readonly AgenticConstructType[];
    readonly lintTarget: LintDiscoveryTarget;
    readonly harnessHints?: readonly AgenticHarnessHint[];
    readonly instructionFormat?: InstructionFileFormat;
    readonly hookPlatform?: "copilot" | "claude";
}

export const AGENTIC_LOCATION_CATALOG: readonly AgenticLocationEntry[] = [
    // Skill lint roots
    {
        id: "skill-github",
        path: ".github/skills",
        matchKind: "directory-prefix",
        primaryConstruct: "skill",
        lintTarget: "skills",
        harnessHints: ["copilot"],
    },
    {
        id: "skill-claude",
        path: ".claude/skills",
        matchKind: "directory-prefix",
        primaryConstruct: "skill",
        lintTarget: "skills",
        harnessHints: ["claude"],
    },
    {
        id: "skill-agents",
        path: ".agents/skills",
        matchKind: "directory-prefix",
        primaryConstruct: "skill",
        lintTarget: "skills",
        harnessHints: ["shared"],
    },
    // Additional skill roots (SKILL.md convention, no alternate layout documented)
    {
        id: "skill-pi",
        path: ".pi/skills",
        matchKind: "directory-prefix",
        primaryConstruct: "skill",
        lintTarget: "skills",
        harnessHints: ["pi"],
    },
    {
        id: "skill-pi-prompts",
        path: ".pi/prompts",
        matchKind: "directory-prefix",
        primaryConstruct: "skill",
        lintTarget: "skills",
        harnessHints: ["pi"],
    },
    // Agent lint root (dual-role: agent + instruction)
    {
        id: "agent-github",
        path: ".github/agents",
        matchKind: "directory-prefix",
        primaryConstruct: "agent",
        secondaryConstructs: ["instruction"],
        lintTarget: "agents",
        harnessHints: ["copilot"],
        instructionFormat: "copilot-agent",
    },
    // Hook lint exact configs
    {
        id: "hook-copilot-agent-shell",
        path: ".github/hooks/agent-shell/hooks.json",
        matchKind: "exact",
        primaryConstruct: "hook",
        lintTarget: "hooks",
        harnessHints: ["copilot"],
        hookPlatform: "copilot",
    },
    {
        id: "hook-claude-settings",
        path: ".claude/settings.json",
        matchKind: "exact",
        primaryConstruct: "hook",
        lintTarget: "hooks",
        harnessHints: ["claude"],
        hookPlatform: "claude",
    },
    {
        id: "hook-claude-settings-local",
        path: ".claude/settings.local.json",
        matchKind: "exact",
        primaryConstruct: "hook",
        lintTarget: "hooks",
        harnessHints: ["claude"],
        hookPlatform: "claude",
    },
    // Doctor-only hook directory prefixes
    {
        id: "hook-github-dir",
        path: ".github/hooks",
        matchKind: "directory-prefix",
        primaryConstruct: "hook",
        lintTarget: "none",
        harnessHints: ["copilot"],
    },
    {
        id: "hook-claude-dir",
        path: ".claude/hooks",
        matchKind: "directory-prefix",
        primaryConstruct: "hook",
        lintTarget: "none",
        harnessHints: ["claude"],
    },
    // Instruction lint locations
    {
        id: "instruction-copilot-root",
        path: ".github/copilot-instructions.md",
        matchKind: "exact",
        primaryConstruct: "instruction",
        lintTarget: "instructions",
        harnessHints: ["copilot"],
        instructionFormat: "copilot-instructions",
    },
    {
        id: "instruction-copilot-scoped",
        path: ".github/instructions",
        matchKind: "directory-prefix",
        primaryConstruct: "instruction",
        lintTarget: "instructions",
        harnessHints: ["copilot"],
        instructionFormat: "copilot-scoped",
    },
    {
        id: "instruction-agents-md",
        path: "AGENTS.md",
        matchKind: "exact",
        primaryConstruct: "instruction",
        lintTarget: "instructions",
        harnessHints: ["shared"],
        instructionFormat: "agents-md",
    },
    {
        id: "instruction-claude-md",
        path: "CLAUDE.md",
        matchKind: "exact",
        primaryConstruct: "instruction",
        lintTarget: "instructions",
        harnessHints: ["claude"],
        instructionFormat: "claude-md",
    },
    // Subagent lint root
    {
        id: "subagent-claude",
        path: ".claude/agents",
        matchKind: "directory-prefix",
        primaryConstruct: "subagent",
        lintTarget: "subagents",
        harnessHints: ["claude"],
    },
    {
        id: "agent-claude-commands",
        path: ".claude/commands",
        matchKind: "directory-prefix",
        primaryConstruct: "agent",
        lintTarget: "none",
        harnessHints: ["claude"],
    },
    {
        id: "plugin-codex",
        path: ".codex-plugin",
        matchKind: "directory-prefix",
        primaryConstruct: "plugin",
        lintTarget: "none",
        harnessHints: ["codex"],
    },
] as const;
