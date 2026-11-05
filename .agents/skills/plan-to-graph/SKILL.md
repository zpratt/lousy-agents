---
name: plan-to-graph
description: "Converts an approved local spec, master plan, or GitHub epic issue into a GitHub Issue dependency graph with native sub-issues and blocking relationships. Use when asked to 'convert plan to issues', 'create GitHub sub-issues', 'populate issues from a spec', 'plan to graph', or 'break down a GitHub epic into tasks'. Do NOT use to author a new plan (use feature-to-plan) or to rewrite an existing issue in place (use issue-refine-loop)."
argument-hint: "GitHub epic issue URL/number, or path to a local spec or master plan; include a target repository for local files"
effort: medium
allowed-tools: Read, Grep, Glob, Bash, mcp__github
---

# Plan to Graph

Translate an approved plan into GitHub Issues. Do not implement code or modify the source plan. GitHub Issues are the only durable work-item store: use native sub-issues for hierarchy and native blocking relationships for dependencies.

Load [`references/github-surface.md`](./references/github-surface.md) before drafting. That file is the only place that binds abstract operations to concrete tools.

## When to Use

- Convert an approved `*.spec.md`, master plan, or roadmap into GitHub Issues.
- Turn a GitHub epic's `## Tasks` section into native GitHub sub-issues.
- Preserve task requirements and verification as issue bodies while representing explicit dependencies as blocking edges.

Do not use this skill to implement a plan, triage unrelated issues, or create speculative project-management work. Do not use it to author a new plan from an idea (use `feature-to-plan` — spec file or one new GitHub issue) or to rewrite an existing issue in place and split it (use `issue-refine-loop`). A `feature-to-plan`-authored issue whose tasks are already session-sized is a valid epic source; no refine run is required in between.

## Prerequisites and Input

Bind a GitHub surface before drafting. Load [`references/github-surface.md`](./references/github-surface.md) and run its probe once: CCR-proxy check → `gh` candidacy (including the three graph capabilities) → enumerate harness tools **only if `gh` is not a candidate** → score → bind exactly one path. Do not re-probe. Do not mix surfaces. After binding, never invoke `gh` unless `gh` is the bound surface.

A surface qualifies only if it can do all three: create an issue with a parent (`create_child`); add a native `blocked-by` edge (`add_blocked_by`); read back `parent`, `subIssues`, `blockedBy`, and `blocking` (`read_graph`). A missing capability is a blocker, not a degraded mode.

If no surface qualifies, stop before drafting or mutating. Name every surface probed and the capability each one lacked. Do not emulate either relationship with labels, body checklists, comments, or an external tracker.

Resolve the target repository through the bound `resolve_repo` op, using the rules in that reference:

- For a GitHub epic URL, derive `<OWNER/REPO>` from the URL, then confirm it.
- For a GitHub epic number or a local file, require the user to provide `<OWNER/REPO>`; do not infer it from the current checkout.

For a GitHub-epic source, also confirm the complete `read_issue` succeeds (title, body, labels, URL, `subIssues`, `blockedBy`, `blocking`) before parsing.

Accept exactly one source:

- A GitHub epic issue URL or number. Derive the target repository from a URL; require a supplied target repository for a number.
- A readable local spec or master-plan file. The user must also provide a target repository; derive one epic title from the plan title.

This skill produces one epic with a single level of direct children. It does not create nested sub-issues or multiple epics in one run. A canonical `feature-to-plan` spec is one epic: any number of `### Story` / `### Story N` headings under `## User Stories`, and exactly one `## Tasks` section. Story headings are acceptance-criteria structure, not epic groupings. Several story headings are not a reason to stop and are not a reason to invent an epic per story.

The grouping signal is the task list, not the story list. Stop and ask which grouping is the epic, and whether the rest belong in separate runs, only when a local source shows genuine epic-multiplicity: more than one `## Tasks` section, or tasks partitioned under explicit `### Phase` / `### Milestone` (or equivalent) subheadings inside `## Tasks`. Do not silently flatten multiple task groups into one epic.

If the source has no `## Tasks` section, or that section contains no task entries, stop and report that there is nothing to map. Do not infer tasks from prose, requirements, or acceptance criteria.

If authentication, repository resolution, source access, or the epic issue cannot be verified, stop and report the exact blocker. Never substitute labels, body checklists, comments, or an external tracker for native relationships.

For a GitHub epic, `read_issue` its complete title, body, labels, URL, and existing hierarchy before parsing. Treat every task entry under `## Tasks` as a proposed direct child. Existing epic metadata is context only; do not copy it into a child unless that task explicitly includes it. Keep the `subIssues` from this read — step 5 below uses them as a collision check.

## Procedure: Parse and Map

1. Read the complete source before mapping any issue. Identify the epic title, every task heading, each explicit `Depends on` statement, and the complete structured task content.
2. Preserve every task title exactly. Preserve each task body verbatim from its heading through the line before the next task, including **Objective**, **Context**, **Affected files**, **Requirements**, **Verification**, and **Done when**. Put that content in the child issue body; do not split it into comments.
3. For a GitHub epic, use that issue as the parent. For a local source, propose one new epic issue using the source title, then make every task a direct child of it.
4. Map only explicit dependencies. `Task B` with `Depends on: Task A` means B is blocked by A. If a task title, dependency target, scope, or local-plan epic title cannot be mapped unambiguously, stop and ask for clarification. Do not invent tasks, dependencies, labels, or metadata.
5. Check for collisions before drafting. GitHub issues cannot be deleted, only closed, so a duplicate child is manual cleanup for the user and this skill must never create one by accident. Compare every proposed child title from step 2 against the titles of the epic's existing sub-issues, open and closed alike:

   - No existing sub-issues: proceed; this is a first run.
   - Every proposed title already exists: stop. Report that the graph is already populated and change nothing.
   - Some titles exist and some do not: stop. List which proposed children already exist (with URLs) and which are new, then ask the user whether to create only the missing children, or to abort. Do not choose for them.

   For a local source the epic does not exist yet, so `list_issues` for `"<Epic Title> in:title"` before proposing a new one. `in:title` matches loosely, so treat the results as candidates, not answers: compare the returned `title` values yourself and only count an exact string match as a collision. If one exists, stop and ask whether to use that issue as the epic, or to abort. Do not create a second epic with the same title.

   Carry the collision result into the draft gate. Never re-create a child or an epic that already exists.

## Mandatory Draft Gate

Before any `create_issue`, `create_child`, or `add_blocked_by` mutation, present a draft containing:

| Source task | Proposed issue title | Parent epic | Blocked by | Body retained | Status |
| --- | --- | --- | --- | --- | --- |
| Task N | exact title | issue URL/number or proposed epic | explicit task IDs | Objective, Context, Affected files, Requirements, Verification, Done when | new, or already exists (URL) |

Also show the dependency edges in `blocked ← blocker` form and list every unmapped or ambiguous source section. Ask for explicit confirmation. A draft is read-only; do not create issues until the user confirms it.

State the bound surface (and the `gh` version when that is the binding) and the target repository above the table so the user can see where the mutations will land. If any row is `already exists`, say so explicitly in the confirmation request rather than burying it in the table.

## Create and Wire the Confirmed Graph

After confirmation, make one mutation at a time and record every returned issue URL and number. Create only the children the user confirmed; skip any row marked `already exists`.

On the `gh` binding, issue bodies go in temporary files so Markdown survives shell quoting. This skill has no `Write` tool, so create them with a Bash heredoc in a scratch directory outside the repository — never in the working tree. The exact snippet is in [`references/github-surface.md`](./references/github-surface.md). On an MCP binding, pass bodies as parameters; no scratch directory.

Use the bound call for each step. Concrete invocations live only in that reference.

1. For a local source, `create_issue` the confirmed epic first and record its URL/number.
2. `create_child` each confirmed child with its full, verbatim structured task content in the body and the resolved parent. Every child must target the resolved `<OWNER/REPO>`. Do not add task content through issue comments.
3. `add_blocked_by` for every confirmed dependency only after all child URLs/numbers are known.
4. If any GitHub mutation fails, stop immediately. Report the exact call/error and the issue URLs already created; do not continue or guess at recovery. On the `gh` binding, leave the scratch directory in place and name its path in the report, so a resumed run can reuse the bodies instead of regenerating them.
5. `read_graph` the epic and each child. Confirm every child's `parent` is the epic and every explicit edge appears in the relevant `blockedBy`/`blocking` data. Stop and report any mismatch.

## Dependency Mapping Example

If a source task says `Task B` **Depends on** `Task A`, draft `B ← A` and create the corresponding native blocking relationship. Always derive every edge from the current source; never reuse an example graph, issue number, repository, or task mapping from a prior run.

## Completion Output

Report the epic URL, each created child URL/number, the verified `blocked ← blocker` edges, and any source sections deliberately not mapped. Do not claim completion until the GitHub verification output confirms the hierarchy and dependency graph.
