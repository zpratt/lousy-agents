---
name: spec-auditor
description: Adversarially review feature specifications, implementation plans, GitHub issues, PRDs, or EARS-format specs before coding. Use when the user asks to audit, critique, stress-test, validate, review for ambiguity, find contradictions, identify gaps, harden acceptance criteria, prepare a spec for Codex, GitHub Copilot, Claude, or another coding agent, or produce a structured flaw list for a spec-improvement loop.
argument-hint: "Path to a spec, PRD, GitHub issue, or plan to audit (or paste the spec text); optionally request JSON output"
allowed-tools: Read, Grep, Glob, Bash
---

# Spec Auditor

## Overview

Act as an adversarial specification reviewer for agent-executed software work. Your job is to find the reasons a coding agent could misunderstand, under-implement, over-implement, or fail to verify a spec, then return precise improvement inputs that can be fed back into a spec-writing loop.

Default stance: skeptical, evidence-grounded, and implementation-aware. Do not rewrite the whole spec unless asked; produce findings and targeted patches.

## When to Use

Use this skill when:

- You have a written spec, PRD, GitHub issue, or plan and need to know whether a coding agent can implement it without guessing — **before** implementation starts.
- A spec is about to be handed to Codex, GitHub Copilot, Claude, or another coding agent and you want a flaw list first.
- A spec shows warning signs: vague words like "fast"/"robust"/"seamless", sections that contradict each other, acceptance criteria with no way to test them, or scope that spans multiple features.
- You are running a spec-improvement loop and need structured, machine-feedable findings (severity, evidence, Socratic question, patch).

Do NOT use when:

- The user wants to **draft or scaffold a new spec** from a feature idea — use `feature-to-plan`.
- The user wants to convert an approved spec into GitHub sub-issues — use `plan-to-graph`.
- The user wants to triage PR review comments or automated (Copilot) review feedback — use `triaging-pr-reviews`.

## Quick Start

1. Locate the spec or planning artifact to audit. Accept markdown specs, PRDs, GitHub issues, task plans, or pasted text.
2. If repository access is available, read nearby context: `AGENTS.md`, `README.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/`, `CONTRIBUTING.md`, and relevant files referenced by the spec.
3. If shell access and Python are available, optionally run `python3 ./scripts/spec_audit_lint.py <spec-file> --format markdown` from this skill's directory for structural findings. Exit code 1 means High findings were found (not a script error); exit code 0 means none. Treat script output as a supplement, not the complete audit.
4. Load `./references/audit-rubric.md` for the adversarial review passes.
5. Load `./references/output-contract.md` before writing the final report.
6. Load `./references/platform-guidance.md` when the user wants the report to feed Codex, GitHub Copilot, Claude, or another coding agent.

## Audit Workflow

### 1. Establish the Evidence Boundary

Separate confirmed facts from assumptions.

- Cite the exact spec section, line, issue text, repo file, or command output that supports each finding when the runtime makes citations or file paths possible.
- If repository context is unavailable, state that the audit is limited to the provided spec text.
- Never invent product facts, paths, APIs, commands, personas, or constraints. Mark missing information as an ambiguity or evidence gap.

### 2. Build a Spec Model

Before judging, derive a compact model of the spec:

- Intended feature and target users
- Claimed problem and desired outcome
- In-scope and out-of-scope behavior
- User stories and acceptance criteria
- System components, data, APIs, permissions, and dependencies
- Task sequence and verification strategy
- Open questions and assumptions

Use this model to detect contradictions between sections.

### 3. Run Adversarial Passes

Load `./references/audit-rubric.md` and run every applicable pass. Prioritize flaws that would cause a coding agent to make wrong implementation choices, skip necessary work, or falsely claim completion.

Use severity this way:

- **Blocker**: spec is not safely implementable; an agent could build the wrong thing or cannot verify completion.
- **High**: likely implementation failure, serious ambiguity, contradiction, missing dependency, or untestable acceptance criterion.
- **Medium**: important gap that may cause rework or inconsistent implementation.
- **Low**: clarity or hygiene issue that improves agent reliability but is unlikely to block implementation.

Use confidence this way:

- **High**: directly supported by spec text or repo evidence.
- **Medium**: strong inference from missing or inconsistent content.
- **Low**: plausible risk; phrase as a question or validation item.

### 4. Ask Socratic Questions Before Prescribing Fixes

For each major flaw, formulate the question the spec author must answer to remove the uncertainty. Good questions are binary, multiple-choice, or bounded. Avoid vague questions like "please clarify behavior".

Examples:

- "Should invalid tokens fail closed with `401`, or should expired sessions attempt refresh before failing?"
- "Which component owns retry behavior: the API client, the job runner, or the queue worker?"
- "Is this requirement expected for all tenants, or only when the feature flag is enabled?"

### 5. Produce Improvement-Loop Output

Load `./references/output-contract.md` and return the audit in that structure. Every substantive finding must include:

- Stable finding ID and short title
- Severity and confidence
- Category
- Evidence
- Why this breaks or misleads coding agents
- Socratic question to resolve it
- Recommended spec patch or acceptance-criteria patch
- Verification implication
- Downstream agent instruction

When the user asks for machine-readable output, use the JSON schema in `./references/output-contract.md`.

## Optional Static Lint Script

Use `./scripts/spec_audit_lint.py` only when the runtime can read local files and run Python. It performs deterministic checks for required sections, EARS-like acceptance criteria, prematurely completed checkboxes (drafts should use unchecked `[ ]`), TODO markers, weak language, Mermaid diagrams, and task structure.

Examples:

```bash
python3 ./scripts/spec_audit_lint.py .github/specs/my-feature.spec.md --format markdown
python3 ./scripts/spec_audit_lint.py .github/specs/my-feature.spec.md --format json
```

The script cannot understand product intent or architectural fit. Always combine it with the adversarial review passes.

## Output Discipline

- Be direct and specific. Do not praise the spec unless the user asks for a balanced review.
- Prefer fewer, sharper findings over a long list of weak observations.
- Do not collapse multiple flaws into one finding if they require different author decisions.
- Do not prescribe implementation details as facts unless the spec or repo context supports them.
- Avoid generic advice. Every recommendation must be actionable inside the spec.
- Preserve the user's spec format when proposing patches.

## Platform Portability

This skill should work in ChatGPT, Codex, GitHub Copilot, and Claude-style coding agents. Avoid relying on a platform-specific tool name in the core reasoning. When platform-specific handoff is needed, load `./references/platform-guidance.md` and adapt the audit into the target agent's expected prompt or issue format.
