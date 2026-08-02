/**
 * Frozen regression contract for lint-relevant agentic paths.
 * Independent of catalog entry ids/order: the live catalog must still type
 * these paths. Used by core and doctor parity suites so drift cannot hide
 * behind self-consistent catalog edits alone.
 */

import type { AgenticConstructType } from "../entities/agentic-location-catalog.js";

export interface LintRelevantPathExpectation {
    readonly path: string;
    readonly construct: AgenticConstructType;
}

export const LINT_RELEVANT_PATH_CONTRACT: readonly LintRelevantPathExpectation[] =
    [
        { path: ".github/skills/example/SKILL.md", construct: "skill" },
        { path: ".claude/skills/example/SKILL.md", construct: "skill" },
        { path: ".agents/skills/example/SKILL.md", construct: "skill" },
        { path: ".github/agents/reviewer.md", construct: "agent" },
        {
            path: ".github/hooks/agent-shell/hooks.json",
            construct: "hook",
        },
        { path: ".github/hooks/other/config.json", construct: "hook" },
        { path: ".claude/settings.json", construct: "hook" },
        { path: ".claude/settings.local.json", construct: "hook" },
        {
            path: ".github/copilot-instructions.md",
            construct: "instruction",
        },
        {
            path: ".github/instructions/example.instructions.md",
            construct: "instruction",
        },
        { path: "AGENTS.md", construct: "instruction" },
        { path: "CLAUDE.md", construct: "instruction" },
    ] as const;
