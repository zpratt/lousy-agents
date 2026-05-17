# Interactive Drafting Flow

> The `feature-to-plan` skill loads this reference when the user wants a multi-turn collaborative walkthrough — phrases like "walk me through writing a spec", "let's design this feature together" — or when Phase 1 surfaces more than ~3 substantive ambiguities and a single-shot draft would be lossy.
>
> When invoked from the skill's Phase 1, follow this flow until the user approves the outline, then return control. This reference owns the **conversation**; the skill's Phase 2 and Phase 3 own the **file write and validation**.

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

> "We're drafting a feature specification for `<product or repo name from Phase 1 context>`. I'll walk you through context, personas, value, and acceptance criteria, then produce a spec file once you approve the outline."

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

When they answer, reflect back the criteria you'll translate into EARS format. Identify any that should be expressed as **Unwanted** (error handling) or **State-driven** patterns rather than simple Event-driven.

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

- Target file path (e.g., `.github/specs/<kebab-case-feature>.spec.md`, or whatever convention the repo uses)
- Section list (Problem Statement, Personas, Value Assessment, User Stories, Design, Tasks, Out of Scope, Future Considerations)
- One-line summary of each section's content
- Persona table preview (Persona / Impact / Notes)
- Value assessment preview (Primary / Secondary)
- Task count and rough sizing

Present the outline through the agent's approval mechanism. In runtimes with `ExitPlanMode`, call it; otherwise ask for explicit approval in the conversation.

### 6. Hand Back to the Skill

Once the user approves the outline, return control to the skill's Phase 2. Don't try to write the file yourself from this flow — the skill owns:

- Resolving the output path
- Writing the spec using the Spec File Structure template
- Adding the Cross-Reference footer if issue-seeded
- Phase 3 validation

When you hand back, return a one-block summary:

```
Outline approved. Ready for Phase 2.
- Target: <path/to/file>
- Sections: <count>, all required headers present
- Personas: <count> (primary: <name>; secondary: <name>)
- Value: <primary type> / <secondary type>
- Tasks: <N> tasks (rough sizing)
- Open questions to capture: <count>
- Post clarifying questions on issue #<N>? <yes/no>
```

## Tool-Use Discipline

- **Read engineering and product context before drafting.** Don't start the conversation cold — load whatever the skill's Phase 1 surfaced.
- **Never invent product-specific facts.** Personas, metric definitions, internal schemas, or access policies you can't confirm from repo evidence must be flagged in Open Questions, not asserted.
- **Use binary or small-choice prompts for hard decisions.** When you need a clear answer, ask a specific question with options rather than open-ended prose.
- **Don't sprawl.** This is a conversation flow, not an implementation pass. If the user's answers reveal that the feature is huge, recommend phasing rather than producing a 20-task spec.