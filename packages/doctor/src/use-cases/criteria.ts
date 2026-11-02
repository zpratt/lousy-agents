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
            "No declared intent artifact found at .agentic-doctor/intent.json in the directory doctor ran from. All shipped checks still ran, and this finding alone does not fail the command. Doctor does not search parent or home directories, and declared intent does not change the detected archetype.",
        checkMethod: "intent.artifactAbsent",
        checkArgs: {},
    },
    {
        id: "invalid-intent-artifact",
        appliesToHarness: "all",
        severity: "medium",
        classification: "defect",
        category: "governance",
        description:
            "An intent artifact exists at .agentic-doctor/intent.json but was rejected, so doctor treated intent as undeclared. The intent status reports the checked path and the reason; fix the file and re-run doctor. This finding alone does not fail the command.",
        checkMethod: "intent.artifactRejected",
        checkArgs: {},
    },
    {
        id: "malformed-claude-import",
        appliesToHarness: "claude",
        severity: "high",
        classification: "defect",
        category: "malformed-reference",
        description:
            "A Claude @import reference points to a file inside the repository that does not exist.",
        checkMethod: "inventory.edgePresent",
        checkArgs: {
            fromHarness: "claude",
            toHarness: "claude",
            edgeType: "hard-import",
            malformedReasons: ["missing-target"],
        },
    },
    {
        id: "unread-claude-import",
        appliesToHarness: "claude",
        severity: "medium",
        classification: "advisory",
        category: "malformed-reference",
        description:
            "A Claude @import points to a file inside the repository that lint and doctor do not read: a directory, a file with more than one hard link, or a file over 1 MiB. Claude Code may still load it, but nothing here checks its content.",
        checkMethod: "inventory.edgePresent",
        checkArgs: {
            fromHarness: "claude",
            toHarness: "claude",
            edgeType: "hard-import",
            malformedReasons: ["hard-link", "not-regular", "too-large"],
        },
    },
    {
        id: "external-claude-import",
        appliesToHarness: "claude",
        severity: "medium",
        classification: "advisory",
        category: "malformed-reference",
        description:
            "A Claude @import resolves outside the working directory (a ~/ path, an absolute path outside the repository, a ../ path that leaves it, or a symlink whose target is outside it). Claude Code loads it only after a one-time approval in an interactive session. Each such import is its own finding.",
        checkMethod: "inventory.externalImport",
        checkArgs: { fromHarness: "claude" },
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
