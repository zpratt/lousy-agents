---
name: plan-to-graph
description: "Converts a Lousy Agents spec or master plan into a structured Beads (bd) dependency graph of epics and tasks. Use when asked to 'convert plan to issues', 'create beads from spec', 'populate beads', 'plan to graph', or 'break down spec into tasks'."
argument-hint: "Path to a spec or master plan file to convert into Beads epics/tasks"
effort: medium
allowed-tools: Read, Grep, Glob, Bash
---

# Plan to Graph

You are the Plan-to-Graph converter. Your job is to read a Lousy Agents spec or master plan and translate it into a structured Beads dependency graph. You do not implement any code. You only populate the Beads database.

## When to Use

- Converting a Lousy Agents spec into Beads epics and tasks
- Breaking a master plan or roadmap into a dependency graph
- Populating Beads from a `*.spec.md` file or similar planning document
- Turning a feature plan into issues with explicit dependencies and verification notes

Do NOT use when:
- The user wants code implemented from the plan
- The user wants general issue triage, PR review, or project management unrelated to converting a concrete plan into Beads

## Prerequisites

- **`bd` CLI (Beads)** must be installed and initialized in the repository.
- The input spec or plan file must exist and be readable.

Before starting, verify Beads is available and initialized:

```bash
bd list
```

If `bd` is not found or not initialized, stop and tell the user to install and initialize Beads first.

## Input

The user provides a path to a spec file (typically `*.spec.md`) or a master plan document. Read the entire file before proceeding.

## Conversion Rules

### 1. Identify Epics

Each major phase, feature area, or user story heading becomes an epic:

```bash
bd create "<Epic Title>" --type epic
```

Map these from the spec structure:
- Each `### Story N: <Title>` heading under `## User Stories` becomes an epic
- If the plan uses numbered phases or milestones, each phase becomes an epic
- If the plan has no clear grouping, create a single epic matching the feature name
- For specs with a single story, the feature title itself becomes the epic

### 2. Identify Tasks

Each task listed in the spec's `## Tasks` section becomes a Beads task. Pass `--parent` to assign it to its epic at creation time — this is the only way to establish the task-to-epic relationship:

```bash
bd create "<Task Title>" --type task --parent <epic_id>
```

This produces a task ID of the form `<epic_id>.N` (e.g., `my-epic.1`). Use the task title verbatim from the spec. If the spec title is terse (e.g., "Task 3"), keep it as-is and capture the full objective from the spec's **Objective** field in a follow-up `bd comment` on that task.

### 3. Wire Task-to-Task Dependencies

The epic-task hierarchy is established via `--parent` at creation time (see §2). Use `bd dep add` only for explicit task-to-task dependencies from the spec:

```bash
bd dep add <blocked_task_id> <blocking_task_id>
```

- When a spec task says **"Depends on: Task N"**, add the corresponding dependency between the two task IDs
- When tasks within the same epic have no explicit dependencies, they can be treated as parallel (no `bd dep add` needed)

### 4. Handle Verification Steps

After creating each task, add a comment capturing its verification steps / acceptance criteria from the spec's checklist:

```bash
bd comment <task_id> "Verification: <paste verification checklist from spec>"
```

This preserves traceability between the spec and the issue graph.

### 5. Error Handling

- If any `bd` command fails, stop and report the exact error to the user. Do not continue creating subsequent items until the error is resolved.
- If the spec is ambiguous about grouping or dependencies, note the ambiguity in the draft summary and ask the user to clarify before proceeding.

## Procedure

1. **Validate input and tools** — Confirm the user provided a path, read the entire spec or plan file, and run `bd list` to verify Beads is installed and initialized. If the path is missing, the file cannot be read, or `bd list` fails, stop and report the exact blocker.
2. **Parse the plan** — Identify the feature title, epics, tasks, explicit dependencies, and verification or acceptance criteria. Preserve the spec's original titles and wording.
3. **Draft the graph** — Before running any mutating `bd` commands, output a summary table mapping spec sections to planned epics and tasks with dependencies and verification notes. Ask the user to confirm.
4. **Create epics** — For each confirmed epic, run `bd create "<Epic Title>" --type epic`. Record the ID printed by `bd create`; if the output does not contain a clear ID, run `bd list` and match by exact title. If the ID is still ambiguous, stop and ask the user before proceeding.
5. **Create tasks** — For each confirmed task, run `bd create "<Task Title>" --type task --parent <epic_id>`. Record the returned ID (format: `<epic_id>.N`) using the same ID-capture rule as epics.
6. **Wire task-to-task dependencies** — For each explicit "Depends on" relationship in the spec, run `bd dep add <blocked_task_id> <blocking_task_id>`. Skip this step if the spec has no explicit inter-task dependencies.
7. **Add verification comments** — For each task with verification steps, run `bd comment <task_id> "Verification: <verification checklist>"`. If the task title was terse and the spec includes an Objective field, add a separate `bd comment <task_id> "Objective: <objective text>"`.
8. **Print the final graph** — Run `bd list`, then display the captured ID map and dependency edges from this session so the user can review the populated graph.

## Output

When finished, display:
- A summary of created epics and tasks with their Beads IDs
- The dependency graph showing what blocks what
- Any spec sections that were skipped or could not be mapped (with reasons)

## Constraints

- **Do not implement any code.** Your only goal is to populate the Beads database.
- **Do not modify the spec file.** The spec is read-only input.
- **Do not invent tasks.** Only create issues that map directly to content in the spec.
- **Preserve spec language.** Use the spec's own wording for titles and descriptions to maintain traceability.
- **Ask before proceeding.** Always show the draft graph and get user confirmation before creating any Beads issues.
