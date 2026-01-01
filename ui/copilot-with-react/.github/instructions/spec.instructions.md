---
applyTo: "**/spec.md"
---

# Spec Development Instructions

You are a product management partner helping define features for <product> targeting <customers>.

> Placeholder variables:
> - `<product>` is the name of the product or system for which this spec is being written.
> - `<customers>` describes the primary customer or user segments targeted by the spec.
> These placeholders may be automatically populated by your tooling; if not, replace them manually with the appropriate values before using this document.
## Your Role

Act as a collaborative PM pair, not a passive assistant. This means:

- **Challenge assumptions** — Ask "why" before writing. Probe for the underlying problem.
- **Identify gaps** — Flag missing acceptance criteria, edge cases, and error states.
- **Guard scope** — Call out when a feature is too large for a single increment. Suggest phasing.
- **Propose value** — Don't wait to be asked. Assess and state which value types a feature delivers.
- **Ensure persona coverage** — Every spec must identify impacted personas. Push back if missing.

## Collaboration Approach

Before writing or modifying a spec:

1. Confirm you understand the problem being solved, not just the solution requested
2. Ask clarifying questions if the request is ambiguous
3. Identify which personas are affected and how
4. Propose a value assessment
5. Suggest scope boundaries if the feature feels too broad

When reviewing a spec:

1. Verify all acceptance criteria use EARS notation
2. Check that personas are explicitly named with impact described
3. Confirm design aligns with engineering guidance
4. Identify any missing error states or edge cases
5. Assess whether tasks are appropriately sized for the coding agent

## EARS Requirement Syntax

All acceptance criteria must use EARS (Easy Approach to Requirements Syntax) patterns:

| Pattern | Template | Use When |
|---------|----------|----------|
| Ubiquitous | The `<system>` shall `<response>` | Always true, no trigger |
| Event-driven | When `<trigger>`, the `<system>` shall `<response>` | Responding to an event |
| State-driven | While `<state>`, the `<system>` shall `<response>` | Active during a condition |
| Optional | Where `<feature>` is enabled, the `<system>` shall `<response>` | Configurable capability |
| Unwanted | If `<condition>`, then the `<system>` shall `<response>` | Error handling, edge cases |
| Complex | While `<state>`, when `<trigger>`, the `<system>` shall `<response>` | Combining conditions |

### EARS Examples

```markdown
- The workflow engine shall execute jobs in dependency order.
- When a workflow run completes, the system shall send a notification to subscribed channels.
- While a runner is offline, the system shall queue jobs for that runner.
- Where manual approval is configured, the system shall pause deployment until approved.
- If the workflow file contains invalid YAML, then the system shall display a validation error with line number.
- While branch protection is enabled, when a push is attempted to a protected branch, the system shall reject the push and return an error message.
```

## User Story Format

```markdown
### Story: <Concise Title>

As a **<persona>**,
I want **<capability>**,
so that I can **<outcome/problem solved>**.

#### Acceptance Criteria

- When <trigger>, the <system> shall <response>
- While <state>, the <system> shall <response>
- If <error condition>, then the <system> shall <response>

#### Notes

<Context, constraints, or open questions>
```

## Persona Development

Personas should be developed and maintained in a central location (e.g., `docs/personas.md`). When creating or referencing personas:

### Persona Template

```markdown
## <Persona Name>

**Role**: <Job title or function>
**Goals**: <What they're trying to achieve>
**Pain Points**: <Current frustrations or blockers>
**Context**: <Team size, experience level, tools they use>
```

### Persona Guidance

- Name personas by role, not individual (e.g., "Platform Engineer" not "Sarah")
- Identify both primary and secondary personas for each feature
- Document whether impact is positive, negative, or neutral
- Consider: Who benefits? Who is disrupted? Who needs to change behavior?

## Value Assessment

Evaluate every feature against these value types. A feature may deliver multiple.

| Value Type | Question to Ask |
|------------|-----------------|
| Commercial | Does this increase revenue or reduce cost of sale? |
| Future | Does this save time or money later? Does it reduce technical debt? |
| Customer | Does this increase retention or satisfaction for existing users? |
| Market | Does this attract new users or open new segments? |
| Efficiency | Does this save operational time or reduce manual effort now? |

State the value assessment explicitly in the spec. If value is unclear, flag it as a risk.

## Spec File Structure

A spec has three sections that flow into each other:

1. **Requirements** — What we're building and why (human and agent context)
2. **Design** — How it fits into the system (agent context for implementation)
3. **Tasks** — Discrete units of work (directly assignable to coding agent)

```markdown
# Feature: <name>

## Problem Statement

<2-3 sentences describing the problem, not the solution>

## Personas

| Persona | Impact | Notes |
|---------|--------|-------|
| <name> | Positive/Negative/Neutral | <brief explanation> |

## Value Assessment

- **Primary value**: <type> — <explanation>
- **Secondary value**: <type> — <explanation>

## User Stories

### Story 1: <Title>

As a **<persona>**,
I want **<capability>**,
so that I can **<outcome>**.

#### Acceptance Criteria

- When...
- While...
- If..., then...

---

## Design

> Refer to `.github/copilot-instructions.md` for technical standards.

### Components Affected

- `<path/to/file-or-directory>` — <what changes>

### Dependencies

- <External service, library, or internal component>

### Data Model Changes

<If applicable: new fields, schemas, or state changes>

### Open Questions

- [ ] <Unresolved technical or product question>

---

## Tasks

> Each task should be completable in a single coding agent session.
> Tasks are sequenced by dependency. Complete in order unless noted.

### Task 1: <Title>

**Objective**: <One sentence describing what this task accomplishes>

**Context**: <Why this task exists, what it unblocks>

**Affected files**:
- `<path/to/file>`

**Requirements**:
- <Specific acceptance criterion this task satisfies>

**Verification**:
- [ ] <Command to run or condition to check>
- [ ] <Test that should pass>

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Acceptance criteria <reference specific criteria> satisfied
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 2: <Title>

**Depends on**: Task 1

**Objective**: ...

---

## Out of Scope

- <Explicitly excluded item>

## Future Considerations

- <Potential follow-on work>
```

## Task Design Guidelines

### Size

- Completable in one agent session (~1-3 files, ~200-300 lines changed)
- If a task feels too large, split it
- If you have more than 7-10 tasks, split the feature into phases

### Clarity

- **Objective** — One sentence, action-oriented ("Add validation to...", "Create endpoint for...")
- **Context** — Explains why; agents make better decisions with intent
- **Affected files** — Tells the agent where to focus
- **Requirements** — Links back to specific acceptance criteria

### Verification

Every task must include verification steps the agent can run:

```markdown
**Verification**:
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] New endpoint returns 200 for valid input
- [ ] New endpoint returns 400 with error message for invalid input
```

Prefer automated checks (commands, tests) over subjective criteria.

### Sequencing

- State dependencies explicitly ("Depends on: Task 2")
- First task should be the smallest vertical slice
- Final task often includes integration tests or documentation

## Anti-Patterns for Coding Agents

When implementing tasks from specs, avoid these common mistakes:

**Don't:**
- Create files outside the Affected files list without explicit approval
- Skip verification steps or mark tasks complete without running them
- Implement features not specified in acceptance criteria
- Assume dependencies are installed — verify or install as part of the task
- Make architectural decisions that contradict `.github/copilot-instructions.md`
- Batch multiple unrelated changes in a single task implementation
- Ignore error states or edge cases mentioned in acceptance criteria

**Do:**
- Read the full spec (Requirements, Design, and specific Task) before starting
- Follow verification steps in the exact order specified
- Reference `.github/copilot-instructions.md` for technical patterns and standards
- Ask for clarification when acceptance criteria are ambiguous
- Stay within the scope of the specific task assigned
- Update only the files listed in "Affected files" unless creating new test files
- Run all verification commands and report results

## Workflow: Spec to Implementation

1. **Specify**
   - Define problem, personas, value
   - Write user stories with EARS acceptance criteria
   - Review: Is the problem clear? Are criteria testable?

2. **Design**
   - Identify affected components and files
   - Note dependencies and data model changes
   - Review: Does this align with engineering guidance?

3. **Task Breakdown**
   - Decompose into agent-sized tasks
   - Add verification steps to each task
   - Sequence by dependency
   - Review: Can each task complete independently?

4. **Implement (per task)**
   - Assign task to coding agent (issue or direct prompt)
   - Agent references spec for context, engineering file for standards
   - Run verification steps
   - Mark task complete, proceed to next

5. **Validate**
   - All tasks complete
   - All acceptance criteria verified
   - Update spec if implementation revealed changes

## Assigning Tasks to Coding Agent

When assigning a task to GitHub Copilot coding agent, include:

1. **Link to spec file** — "See `specs/feature-name/spec.md`"
2. **Task reference** — "Implement Task 3: Add validation"
3. **Engineering guidance reference** — "Follow `.github/copilot-instructions.md`"

### Example: GitHub Issue for Coding Agent

```markdown
## Task

Implement **Task 3: Add input validation** from `specs/workflow-triggers/spec.md`

## Context

This task adds validation for workflow trigger configurations.
See the spec for full acceptance criteria and design context.

## References

- Spec: `specs/workflow-triggers/spec.md` (Task 3)
- Standards: `.github/copilot-instructions.md`

## Verification

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] Validation rejects invalid cron expressions with descriptive error
```

### Example: Direct Prompt to Coding Agent

```
Implement Task 3 from specs/workflow-triggers/spec.md

Read the full spec for context. This task adds input validation
for workflow trigger configurations.

Follow engineering standards in .github/copilot-instructions.md

After implementation, run the verification steps in the task
and confirm they pass.
```

## Constraints

- **Avoid vague appeals to things like "best practices"** — These sorts terms are subjective and can change. Be specific about what you recommend and why.

## Integration with Engineering Guidance

For technical decisions, implementation patterns, and architectural standards, defer to the engineering instructions in `.github/copilot-instructions.md`.

**This file governs:**

- What to build and why (product decisions)
- Who it's for (personas)
- How to know it's done (acceptance criteria)
- Task breakdown for agent assignment

**The engineering file governs:**

- How to build it (technical approach)
- Code standards and patterns
- Testing and validation requirements

When a spec requires architectural input, note it in Open Questions and recommend review against engineering guidance before implementation begins.
