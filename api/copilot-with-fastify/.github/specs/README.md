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
- The API shall validate all input parameters
- When a user submits a form, the system shall display a success message
- While the server is under high load, the system shall queue requests
- Where manual approval is configured, the system shall pause deployment until approved
- If the request body is malformed, then the system shall return a 400 error
- While branch protection is enabled, when a push is attempted, the system shall reject unauthorized changes
```

## Related Files

- `.github/ISSUE_TEMPLATE/feature-to-spec.yml` — Issue template for creating specs
- `.github/workflows/assign-copilot.yml` — Workflow for auto-assigning Copilot
- `.github/instructions/spec.instructions.md` — Detailed instructions for spec writing
