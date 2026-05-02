# Gemini Instructions: Lousy Agents

This project uses a shared instruction architecture. Domain-specific rules are stored in `.github/instructions/`.

See @.github/context/project.context.md for full project context.

## Shared Instructions Triggers

When performing the following tasks, you **MUST** read the corresponding instruction file using `read_file` to ensure compliance with project standards:

- **Modifying source code (`packages/*/src/`):** Read `.github/instructions/software-architecture.instructions.md`.
- **Writing or modifying tests:** Read `.github/instructions/test.instructions.md`.
- **Working with specs (`*.spec.md`):** Read `.github/instructions/spec.instructions.md`.
- **Modifying GitHub workflows:** Read `.github/instructions/pipeline.instructions.md`.

## Gemini Cognitive Mandates

### Directives vs. Inquiries
- Reports of bugs, open issues, or general observations are **Inquiries** unless the user explicitly issues a **Directive** to implement a fix.
- For Inquiries: Research and analyze only. Propose a solution but **DO NOT** modify files until a Directive is issued.

### Topic Management (`update_topic`)
You must use `update_topic` to signal strategic transitions. At a minimum, call it for these phases:
1. **Research & Reproduction:** Investigating the codebase or reproducing a bug.
2. **Strategy & Design:** Proposing a solution (Inquiry phase) or planning an implementation (Directive phase).
3. **TDD Implementation:** Writing the failing test and implementing the fix.
4. **Validation & CI:** Running `mise run ci` and confirming the Definition of Done.

### Task Tracking (Beads)
- **Authoritative Source:** Beads (`bd`) is the **ONLY** source of truth for task tracking.
- **NEVER** use `MEMORY.md` or ad-hoc markdown lists for task management.
- **Workflow:** `bd create` (if needed) -> `bd show` -> `bd list` -> `bd close`.

### Personal Memory (`MEMORY.md`)
- Use strictly for personal, unstructured notes or long-lived index pointers to sibling notes in the memory folder.
- **NEVER** store task status or project-wide conventions here.

## Core Workflow: TDD Mandatory

You MUST follow the TDD loop for all code changes:
1. **Research:** Understand the current behavior.
2. **Failing Test:** Write a Vitest test that reproduces the issue or describes the new feature.
3. **Implement:** Write minimal code to pass the test.
4. **Validate:** Run `mise run test && mise run lint`.
5. **CI Check:** Run `mise run ci`.

### Essential Commands
- `mise run test`: Run Vitest tests.
- `mise run lint`: Run all linters (Biome, actionlint, etc.).
- `mise run ci`: Full validation (lint -> test -> test-integration -> smoke-test). **MUST exit 0 before task completion.**

## Tooling Efficiency

- **Parallelism:** Execute independent `read_file`, `grep_search`, and `run_shell_command` calls in parallel.
- **Grep Context:** Use `context`, `before`, or `after` in `grep_search` to gather enough information to perform a `replace` without an intermediate `read_file` turn.
- **Mise:** Always prefix system commands with `mise exec --` or ensure mise is activated.

## Definition of Done
A task is complete **ONLY** when:
1. Acceptance criteria are met.
2. `mise run ci` exits `0`.
3. The corresponding Beads (`bd`) task is closed.
