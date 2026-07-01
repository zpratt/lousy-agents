import type { Criterion } from "../entities/criteria-schema.js";

export const CRITERIA: readonly Criterion[] = [
    {
        id: "missing-copilot-instructions",
        appliesToHarness: "copilot",
        severity: "critical",
        classification: "defect",
        category: "missing-required",
        description:
            "GitHub Copilot requires .github/copilot-instructions.md to load workspace instructions. Without it, Copilot operates without any project-specific context.",
        capability: "copilot-workspace-instructions",
        checkMethod: "inventory.fileExists",
        checkArgs: {
            harness: "copilot",
            paths: [".github/copilot-instructions.md"],
        },
    },
    {
        id: "missing-intent-artifact",
        appliesToHarness: "all",
        severity: "medium",
        classification: "defect",
        category: "governance",
        description:
            "No declared intent artifact found at .agentic-doctor/intent.json. Without declared intent, the doctor cannot evaluate capability preconditions.",
        checkMethod: "inventory.constructPresent",
        checkArgs: {
            harness: "claude",
            constructType: "instruction",
        },
    },
    {
        id: "malformed-claude-import",
        appliesToHarness: "claude",
        severity: "high",
        classification: "defect",
        category: "malformed-reference",
        description:
            "A Claude @import reference points to a file that does not exist or escapes the repository root.",
        checkMethod: "inventory.edgePresent",
        checkArgs: {
            fromHarness: "claude",
            toHarness: "claude",
            edgeType: "hard-import",
        },
    },
    {
        id: "cross-harness-drift",
        appliesToHarness: "all",
        appliesToArchetype: "accidental-sprawl",
        severity: "high",
        classification: "advisory",
        category: "drift",
        description:
            "Multiple AI harnesses are configured but share no cross-harness references. This may indicate accidental configuration sprawl rather than intentional multi-harness setup.",
        checkMethod: "inventory.archetypeIs",
        checkArgs: {},
    },
    {
        id: "wrong-direction-copilot-imports-claude",
        appliesToHarness: "copilot",
        severity: "medium",
        classification: "advisory",
        category: "wrong-direction",
        description:
            "A Copilot instruction file uses Claude's @path hard-import syntax to reference a Claude instruction file. Copilot does not process @path hard-imports, so this reference has no effect and may indicate copy-paste drift.",
        checkMethod: "inventory.edgeDirectionExists",
        checkArgs: {
            fromHarness: "copilot",
            toHarness: "claude",
            edgeType: "hard-import",
        },
    },
    {
        id: "wrong-direction-copilot-links-claude",
        appliesToHarness: "copilot",
        severity: "medium",
        classification: "advisory",
        category: "wrong-direction",
        description:
            "A Copilot instruction file contains a markdown hyperlink (or frontmatter see:/references:/requires: entry) pointing to a Claude instruction file. The Copilot CLI does not follow markdown hyperlinks or soft references in instructions, so this reference has no effect and may indicate copy-paste drift.",
        checkMethod: "inventory.edgeDirectionExists",
        checkArgs: {
            fromHarness: "copilot",
            toHarness: "claude",
            edgeType: "soft-reference",
        },
    },
    {
        id: "missing-claude-md",
        appliesToHarness: "claude",
        severity: "high",
        classification: "defect",
        category: "missing-required",
        description:
            "Claude Code requires CLAUDE.md or .claude/ directory to load project instructions.",
        checkMethod: "inventory.fileExists",
        checkArgs: {
            harness: "claude",
            paths: ["CLAUDE.md", ".claude/"],
        },
    },
    {
        id: "missing-agents-md",
        appliesToHarness: "codex",
        severity: "high",
        classification: "defect",
        category: "missing-required",
        description:
            "Codex/OpenAI Codex requires AGENTS.md to load project instructions.",
        checkMethod: "inventory.fileExists",
        checkArgs: {
            harness: "codex",
            paths: ["AGENTS.md", "AGENTS.override.md"],
        },
    },
    {
        id: "missing-hermes-config",
        appliesToHarness: "hermes",
        severity: "medium",
        classification: "advisory",
        category: "missing-required",
        description:
            "Hermes does not have a primary configuration file (.hermes.md or HERMES.md).",
        checkMethod: "inventory.fileExists",
        checkArgs: {
            harness: "hermes",
            paths: [".hermes.md", "HERMES.md"],
        },
    },
    {
        id: "missing-crush-config",
        appliesToHarness: "crush",
        severity: "medium",
        classification: "advisory",
        category: "missing-required",
        description: "Crush does not have a crush.json configuration file.",
        checkMethod: "inventory.fileExists",
        checkArgs: {
            harness: "crush",
            paths: ["crush.json"],
        },
    },
] as const;
