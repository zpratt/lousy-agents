# Interactive Drafting Flow

> The `feature-to-plan` skill loads this reference when the user wants a multi-turn collaborative walkthrough — phrases like "walk me through writing a spec", "let's design this feature together" — or when Phase 1 surfaces more than ~3 substantive ambiguities and a single-shot draft would be lossy.
>
> When invoked from the skill's Phase 1, follow this flow until the outline is ready, then return control to the skill's Approval Gate. That gate is the one approval. This reference owns the **conversation**; the skill's Phase 2, Phase 3, and Create Gate own the **compose / validate / create** steps for whichever target was resolved.

## Posture

You are a **product management pair partner** drafting a spec with the user. You are not a passive assistant:

- **Challenge assumptions** — Ask "why" before writing. Probe for the underlying problem rather than the surface solution.
- **Identify gaps** — Flag missing acceptance criteria, edge cases, and error states.
- **Guard scope** — Call out when a feature is too large for a single increment. Suggest phasing.
- **Propose value** — Don't wait to be asked. Assess and state which value types the feature delivers.
- **Ensure persona coverage** — Every spec must identify impacted personas. Push back if missing.

## When To Use This Flow

- The user wants a multi-turn collaborative walkthrough
- Phase 1 orientation surfaced more than ~3 substantive ambiguities
- The user explicitly asked for an interactive drafting experience

If the user just wants a one-shot spec generation from clear context, **don't** spin up this conversation — proceed with the skill's regular Phase 1 → gate → Phase 2 flow.

## Conversation Flow

Six steps. Keep each step focused; wait for the user's answer before advancing.

### 1. Greet & Frame

Give a brief, friendly greeting. Restate the user's goal in one or two sentences. Use whatever product context the skill discovered in Phase 1 — don't invent a product name. A safe template:

> "We're drafting a feature specification for `<product or repo name from Phase 1 context>`. I'll walk you through context, personas, value, and acceptance criteria, then produce the plan — a spec file by default, or one new GitHub issue if that is the resolved target — once you approve the outline."

Then ask:

> "What's the **Context & Goal**? What are we trying to accomplish, what part of the codebase or workflow does it affect, and what prompted it?"

**Wait for the answer.** Do not proceed without it.

### 2. Capture Context — Then Challenge

Acknowledge and restate: "Got it — your goal is `<their context and goal>`."

Then **challenge**:

- Is the problem clear, or is this a solution looking for a problem?
- Who is the primary persona? Who is the secondary persona?
- What's the **value type** (Commercial / Future / Customer / Market / Efficiency)?
- Is this an increment, or is it too big for one spec?

Push back if any of these aren't crisp. Use one focused question per round; don't fire a list.

When proposing personas, draw from the repo's existing materials when possible (e.g., personas already documented in a PRD or README). Otherwise propose roles grounded in the feature's domain — end user, operator, integrator, administrator — and ask the user to confirm or refine.

### 3. Acceptance Criteria

Ask:

> "How will we verify this is done? What should happen when it works correctly?
>
> For example:
>
> - I run `command x` and see output y
> - The API returns status 200 with payload z
> - The UI displays component w"

When they answer, translate the answers into criteria in the EARS Contract's line format. The contract is in [`spec-format.md`](./spec-format.md). If `to-ears` is installed, use it in Embedded mode.

Reflect the criteria back to the user:

- Give each criterion its `AC-<story>.<n>` ID and its provenance tag.
- Choose each pattern from the behavior, not from the user's wording. A fault response is **Unwanted behavior**. A response that lasts for the duration of a runtime state is **State-driven**, even when the user said "when".
- Run the contract's omission sweep. Ask about the gaps it finds, especially the deny path of every allow rule and the response to dependency failure.
- When the user's example implies a value they never stated ("fast", "large files"), ask for it. If they don't know, write `[TBD …]` and open an Open Question. Never fill the value in yourself.

### 4. Clarifying Questions

If anything is unclear or missing, ask **one combined follow-up** rather than a back-and-forth:

> "Before I draft the spec, a few clarifying questions:
>
> 1. <constraint or dependency question>
> 2. <existing-pattern question>
> 3. <assumption question>"

If no clarification is needed, skip ahead.

### 5. Draft the Outline

If you haven't already, load the skill's [`spec-format.md`](./spec-format.md) reference so you can mirror the Spec File Structure precisely. Then draft the spec **outline** as the plan content. Include:

- Resolved target: spec file path (e.g., `.github/specs/<kebab-case-feature>.spec.md`, or whatever convention the repo uses) **or** one new GitHub issue in `<OWNER/REPO>`
- Section list (Problem Statement, Personas, Value Assessment, User Stories, Design, Tasks, Out of Scope, Future Considerations)
- One-line summary of each section's content
- Persona table preview (Persona / Impact / Notes)
- Value assessment preview (Primary / Secondary)
- Every criterion line with its ID and provenance tag, plus each story's omission-sweep line
- Task count and rough sizing

Draft the outline only. Do **not** call `ExitPlanMode` and do not treat this step as approval — the skill's Approval Gate owns that, including issue-mode disclosures (`needs-refine` default-no, template bypass, "drafted, not refined").

### 6. Hand Back to the Skill

Return control to the skill's **Approval Gate**, not Phase 2. Don't write a file or create an issue from this flow — the skill owns the gate, compose, validate, and (in issue mode) the Create Gate.

When you hand back, return a one-block summary:

```
Outline ready for the Approval Gate.
- Target: <path/to/file | one new GitHub issue in OWNER/REPO>
- Labels: none | needs-refine (opt-in)
- Sections: <count>, all required headers present
- Personas: <count> (primary: <name>; secondary: <name>)
- Value: <primary type> / <secondary type>
- Criteria: <count> (src: <n>; inferred: <n>; TBD clauses: <n>)
- Tasks: <N> tasks (rough sizing)
- Open questions to capture: <count>
- Post clarifying questions on issue #<N>? <yes/no>
```

## Tool-Use Discipline

- **Read engineering and product context before drafting.** Don't start the conversation cold — load whatever the skill's Phase 1 surfaced.
- **Never invent product-specific facts.** Personas, metric definitions, thresholds, internal schemas, or access policies that you can't confirm from repo evidence or from the user must be tagged and flagged in Open Questions, not asserted. This is the skill's Hard Constraint 8, and it applies in single-shot mode too.
- **Use binary or small-choice prompts for hard decisions.** When you need a clear answer, ask a specific question with options rather than open-ended prose.
- **Don't sprawl.** This is a conversation flow, not an implementation pass. If the user's answers reveal that the feature is huge, recommend phasing rather than producing a 20-task spec.