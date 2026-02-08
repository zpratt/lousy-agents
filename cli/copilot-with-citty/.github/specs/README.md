# Specifications Directory

This directory contains feature specifications created through the spec-driven development workflow.

## Workflow Overview

1. **Create a Spec Issue** — Use the "Copilot Feature To Spec" issue template to define your feature
2. **Auto-Assignment** — Issues with the `copilot-ready` label automatically trigger Copilot assignment
3. **Spec Creation** — Copilot creates a structured specification in this directory
4. **Implementation** — Follow the tasks in the spec to implement the feature

## Spec File Structure

Each spec follows this structure:

```markdown
# Feature: <name>

## Problem Statement
<2-3 sentences describing the problem>

## Personas
| Persona | Impact | Notes |
|---------|--------|-------|

## Value Assessment
- **Primary value**: <type> — <explanation>

## User Stories

### Story 1: <Title>
As a **<persona>**,
I want **<capability>**,
so that I can **<outcome>**.

#### Acceptance Criteria
- When <trigger>, the <system> shall <response>

---

## Design

### Components Affected
### Dependencies
### Open Questions

---

## Tasks

### Task 1: <Title>
**Objective**: ...
**Verification**: ...
```

## EARS Syntax for Acceptance Criteria

Use EARS (Easy Approach to Requirements Syntax) patterns:

| Pattern | Template | Use When |
|---------|----------|----------|
| Ubiquitous | The `<system>` shall `<response>` | Always true |
| Event-driven | When `<trigger>`, the `<system>` shall `<response>` | Responding to event |
| State-driven | While `<state>`, the `<system>` shall `<response>` | During a condition |
| Optional | Where `<feature>` is enabled, the `<system>` shall `<response>` | Configurable capability |
| Unwanted | If `<condition>`, then the `<system>` shall `<response>` | Error handling |
| Complex | While `<state>`, when `<trigger>`, the `<system>` shall `<response>` | Combining conditions |

### Examples

```markdown
- The CLI shall validate all input arguments
- When a user runs a command, the system shall display the result
- While verbose mode is enabled, the system shall log debug information
- Where custom configuration is provided, the system shall use it instead of defaults
- If the input is malformed, then the system shall return a descriptive error
- While strict mode is enabled, when an unknown argument is provided, the system shall reject the command
```

## Related Files

- `.github/ISSUE_TEMPLATE/feature-to-spec.yml` — Issue template for creating specs
- `.github/workflows/assign-copilot.yml` — Workflow for auto-assigning Copilot
- `.github/instructions/spec.instructions.md` — Detailed instructions for spec writing
