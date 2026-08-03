---
name: feature-to-plan
description: Use when the user asks to turn a feature request, idea, PRD draft, or backlog issue into a structured EARS-format spec. Trigger phrases include "draft a spec", "plan a feature", "scaffold a spec", "write a feature spec", "convert this issue to a spec", "plan this issue", or invocation via /feature-to-plan. Do NOT use for reviewing an existing spec PR (use triaging-pr-reviews) or for editing a specific section of an already-drafted spec (use a direct Edit instead).
argument-hint: "GitHub issue number (e.g., #47), a feature name, or empty for interactive drafting"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Feature to Plan

## Overview

Convert a feature request — either freeform or seeded from a GitHub issue — into an EARS-format spec under the repo's specs directory (default `.github/specs/`).

```
Phase 1: Orient   (read-only planning — read context, identify ambiguities, draft outline)
        ↓
   Approval Gate  (present the planned spec outline and wait for approval)
        ↓
Phase 2: Create   (write the spec file, optionally post clarifying comments)
        ↓
Phase 3: Validate (diff → classify findings → fix loop, ≤3 rounds)
```

Two on-demand references back this skill:

- [`references/spec-format.md`](./references/spec-format.md) — EARS patterns, persona template, value assessment, the full Spec File Structure, task design guidelines, and Mermaid diagram requirements. **Load when drafting Phase 2 output.**
- [`references/interactive-flow.md`](./references/interactive-flow.md) — a six-step collaborative conversation flow (greet → context → criteria → clarify → outline → write). **Load when the user wants multi-turn drafting or Phase 1 surfaces more than ~3 substantive ambiguities.**

## When to Use

- User asks to "draft / plan / scaffold / write" a spec for a feature
- User references a GitHub issue and wants it turned into a spec
- User invokes `/feature-to-plan` (with or without an argument)
- User wants to convert a freeform idea into a structured spec

**Do NOT use when:**

- The task is reviewing an existing spec PR — use `triaging-pr-reviews` instead
- The user wants to edit a specific section of an existing spec — make the targeted Edit directly
- The user is asking implementation questions about an already-written spec — answer from the spec content; don't re-draft

## Prerequisites

- Read access to the current repository
- `gh` CLI authenticated (`gh auth status`) **only if** seeding from a GitHub issue or posting clarifying comments
- Whatever lint/format/test commands the repo defines (used in Phase 3's final check)

## Procedure

> **Note on the invocation argument.** Below, "the argument" refers to whatever string was passed to this skill — for example, the value of `$ARGUMENTS` when invoked via a slash command, the argument supplied through your agent's skill-invocation surface, or the inline argument in a user prompt like "use feature-to-plan on #47". The skill behavior keys off three cases: an issue reference (`#N` or `^\d+$`), a freeform feature name, or empty.

### Phase 1 — Orient (READ-ONLY PLANNING)

Work in a read-only planning phase first. If the runtime provides a dedicated plan mode, use it; otherwise avoid file writes until the Approval Gate is complete.

1. **Discover product and engineering context.** Read whatever conventional files the repo provides — for example `AGENTS.md`, `README.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `CONTRIBUTING.md`, anything under `.github/instructions/`, or product docs under `docs/`. Don't assume any specific file exists; use what's there.
2. **Seed Context & Goal.** Based on the argument:
   - **Issue reference (`#N` or matches `^\d+$`):** fetch the issue and treat its Context & Goal and Acceptance Criteria sections (if present) as the starting point. Note any cross-reference IDs (e.g., a beads ID) in the issue footer.

     ```bash
     gh issue view <N> --json title,body,labels,comments
     ```

   - **Freeform feature name or empty:** the user must provide Context & Goal. Ask once, concisely.
3. **Choose drafting mode.** Decide between single-shot and interactive based on these signals:
   - **Switch to interactive** if (a) the user explicitly asked for a multi-turn walkthrough ("walk me through", "let's draft this together"), or (b) Context & Goal is too thin to outline without back-and-forth, or (c) you anticipate more than ~3 substantive ambiguities.
   - **Otherwise proceed single-shot** through steps 4-5 below.

   To run interactive mode: **load [`references/interactive-flow.md`](./references/interactive-flow.md)** and follow its six-step flow until the outline is ready for the gate. The interactive flow owns the conversation; this skill resumes at the Approval Gate once the outline is approved. **Skip steps 4-5 below in this mode.**
4. **List ambiguities** (single-shot mode). For each one, decide:
   - Resolvable with a reasonable assumption → record the assumption in the draft's "Open Questions" section
   - Requires user input → add to a clarifying-questions list to surface at the gate
5. **Draft the spec outline** (single-shot mode) for approval. Include:
   - Exact target file path (default `.github/specs/<kebab-case-feature>.spec.md`; honor any override the user requested)
   - Section list (Problem Statement, Personas, Value Assessment, User Stories, Design, Tasks, Out of Scope, Future Considerations)
   - One-line persona summary and value-type summary
   - Estimated task count
   - Clarifying-question text to optionally post on the source issue

### Approval Gate

Present the outline through the agent's approval mechanism. In runtimes with `ExitPlanMode`, call it; otherwise ask for explicit approval in the conversation. Present:

- The target file path
- The section list (headers only)
- The persona/value summary
- The task count
- Any clarifying-question text, with an explicit yes/no prompt: "Should I also post these as a comment on issue #N?"

Wait for user approval before continuing.

### Phase 2 — Create (POST-APPROVAL)

1. **Load the spec format reference.** Read [`references/spec-format.md`](./references/spec-format.md) for the authoritative template, EARS patterns, persona table, value assessment block, task structure, and diagram requirements.
2. **Resolve the output path.** Default `.github/specs/<kebab-case-feature>.spec.md`. If the repo uses a different convention (e.g., `docs/specs/`, `specs/`), honor it.
3. **Write the spec** using the Spec File Structure template. The following section *identities* are required — keep the same set of sections in this order. Cosmetic title variation is allowed only when the target repo has an established convention (e.g., `## Stakeholders` instead of `## Personas`, or `## Acceptance` instead of `## Acceptance Criteria`). If you customize a title, keep the role of the section identical to what's described below; never drop a section.
   - `# Feature: <name>`
   - `## Problem Statement` (2-3 sentences — problem, not solution)
   - `## Personas` (table with Impact column)
   - `## Value Assessment` (Primary / Secondary value types)
   - `## User Stories` (each with EARS acceptance criteria)
   - `## Design` (Components Affected, Dependencies, Data Model Changes, Diagrams, Open Questions)
   - `## Tasks` (each with Objective, Context, Affected files, Requirements, Verification, Done when)
   - `## Out of Scope`
   - `## Future Considerations`
4. **Include Mermaid diagrams.** At minimum a data-flow diagram (`flowchart TB` or `flowchart LR`) and a sequence diagram (`sequenceDiagram`). Use state, ER, or class diagrams when the feature warrants them.
5. **Mark every checkbox `[ ]` (not `[x]`).** Tasks, Verification, and Done-when lists are unchecked at draft time. Only the implementer marks them `[x]` as they ship.
6. **Add a Cross-Reference footer if seeded from an issue:**

   ```markdown
   ---

   ## Cross-Reference

   - GitHub Issue: #<N>
   - <Any tracker ID or external link surfaced in Phase 1>
   ```

7. **Optionally post clarifying questions on the source issue** (only if the user opted in at the gate):

   ```bash
   gh issue comment <N> --body "Clarifying questions before drafting the spec: ..."
   ```

### Phase 3 — Validate

1. **Generate the diff:**

   ```bash
   git diff -- <path/to/new-spec>
   ```

2. **Classify each finding.** Apply the classification rubric inline:
   - **Security** — Does the spec leak credentials, prescribe unsafe defaults, or invite injection patterns?
   - **Correctness** — Are EARS criteria testable? Do tasks have measurable verification?
   - **Performance** — Does the design imply hot paths, N+1 patterns, or unbounded loops?
   - **Style** — Headings, link formats, file conventions consistent with the repo
   - **Architecture** — Does the design contradict existing engineering guidance you read in Phase 1?
3. **Re-Edit the spec** to resolve each finding. Keep this lightweight — don't rewrite working content.
4. **Iterate up to 3 rounds.** Exit when no high/medium severity findings remain or after the third round, whichever comes first.
5. **Run the repo's own validation gate** before reporting completion. Use whatever the repo defines — for example `make lint`, `npm run lint`, `bun run format:check && bun run lint`, `cargo fmt --check`, or a CI workflow. Markdown-only changes typically don't affect test/build, but running the gate keeps you honest.

## Delegation Rules

| Situation                                                                                  | Hand off to                                                                              |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| User says "walk me through" / "let's draft this together" / wants multi-turn collaboration | Load [`references/interactive-flow.md`](./references/interactive-flow.md)                |
| Phase 1 surfaces > 3 substantive ambiguities                                               | Load [`references/interactive-flow.md`](./references/interactive-flow.md)                |
| Spec already lives in an open PR and the user wants review                                 | `triaging-pr-reviews` skill with the PR number — this skill should not be used at all    |

## Output Contract

- **File path:** `.github/specs/<kebab-case-feature>.spec.md` by default, or the user's specified location
- **Required sections:** all sections in the Spec File Structure template (see [`references/spec-format.md`](./references/spec-format.md))
- **EARS:** every acceptance criterion uses one of the six EARS patterns (Ubiquitous, Event-driven, State-driven, Optional, Unwanted, Complex)
- **Diagrams:** at least one Mermaid data-flow diagram and one sequence diagram
- **Tasks:** each has Objective, Context, Affected files, Requirements, Verification, Done when — checkboxes start unchecked
- **Cross-Reference footer:** present if seeded from a GitHub issue

## Gotchas

- **Historical specs use varying extensions** (`*.md`, `*.spec.md`, `*.prd.md`). Match whatever the target repo already uses; don't rename existing files.
- **Nested planning states behave unexpectedly.** If the runtime uses a dedicated plan mode and the skill is invoked while already planning, calling `ExitPlanMode` may exit the **outer** plan. Make this clear in the gate prompt.
- **Spec output path is not universal.** Default to `.github/specs/` but respect any existing convention you find (e.g., `docs/specs/`, `specs/`, `rfcs/`).
