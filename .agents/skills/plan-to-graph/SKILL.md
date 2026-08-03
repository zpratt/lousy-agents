---
name: plan-to-graph
description: "Converts an approved local spec, master plan, or GitHub epic issue into a GitHub Issue dependency graph with native sub-issues and blocking relationships. Use when asked to 'convert plan to issues', 'create GitHub sub-issues', 'populate issues from a spec', 'plan to graph', or 'break down a GitHub epic into tasks'."
argument-hint: "GitHub epic issue URL/number, or path to a local spec or master plan; include a target repository for local files"
effort: medium
allowed-tools: Read, Grep, Glob, Bash
---

# Plan to Graph

Translate an approved plan into GitHub Issues. Do not implement code or modify the source plan. GitHub Issues are the only durable work-item store: use native sub-issues for hierarchy and native blocking relationships for dependencies.

## When to Use

- Convert an approved `*.spec.md`, master plan, or roadmap into GitHub Issues.
- Turn a GitHub epic's `## Tasks` section into native GitHub sub-issues.
- Preserve task requirements and verification as issue bodies while representing explicit dependencies as blocking edges.

Do not use this skill to implement a plan, triage unrelated issues, or create speculative project-management work.

## Prerequisites and Input

Require authenticated GitHub CLI access. Resolve the target repository before drafting:

```bash
gh auth status
gh repo view <OWNER/REPO> --json nameWithOwner,url
```

- For a GitHub epic URL, derive `<OWNER/REPO>` from the URL, then verify it with `gh repo view`.
- For a GitHub epic number or a local file, require the user to provide `<OWNER/REPO>`; do not infer it from the current checkout.

Before drafting, confirm that the installed GitHub CLI supports the required native-relationship flags and returns every required issue JSON field. These checks are read-only:

```bash
gh version
gh issue create --help
gh issue edit --help
gh issue view --help
```

Record the `gh` version. Confirm the `create` help output includes `--parent`, the `edit` help output includes `--add-blocked-by`, and the `view` help output lists `blockedBy`, `blocking`, `parent`, and `subIssues`. Every one of those JSON fields is used later to verify the graph; a missing field is a blocker, not a degraded mode. For a GitHub-epic source, also confirm the complete read succeeds:

```bash
gh issue view <EPIC> --repo <OWNER/REPO> --json number,title,body,labels,url,subIssues,blockedBy,blocking
```

If any check fails, stop before drafting or mutating and report the installed `gh` version plus the missing capability. Ask the user to upgrade to a GitHub CLI version that supports native sub-issues and blocking relationships; do not emulate either relationship with labels, body checklists, comments, or an external tracker.

Accept exactly one source:

- A GitHub epic issue URL or number. Derive the target repository from a URL; require a supplied target repository for a number.
- A readable local spec or master-plan file. The user must also provide a target repository; derive one epic title from the plan title.

This skill produces one epic with a single level of direct children. It does not create nested sub-issues or multiple epics in one run. If a local source implies more than one grouping — several `### Story N` headings under `## User Stories`, numbered phases, or distinct milestones — stop and ask the user which grouping is the epic and whether the rest belong in separate runs. Do not silently flatten multiple stories into one epic, and do not invent an epic per story on your own.

If the source has no `## Tasks` section, or that section contains no task entries, stop and report that there is nothing to map. Do not infer tasks from prose, requirements, or acceptance criteria.

If authentication, repository resolution, source access, or the epic issue cannot be verified, stop and report the exact blocker. Never substitute labels, body checklists, or an external tracker for native relationships.

For a GitHub epic, read its complete title, body, labels, URL, and existing hierarchy before parsing:

```bash
gh issue view <EPIC> --repo <OWNER/REPO> --json number,title,body,labels,url,subIssues,blockedBy,blocking
```

Treat every task entry under `## Tasks` as a proposed direct child. Existing epic metadata is context only; do not copy it into a child unless that task explicitly includes it. Keep the `subIssues` from this read — step 5 below uses them as a collision check.

## Procedure: Parse and Map

1. Read the complete source before mapping any issue. Identify the epic title, every task heading, each explicit `Depends on` statement, and the complete structured task content.
2. Preserve every task title exactly. Preserve each task body verbatim from its heading through the line before the next task, including **Objective**, **Context**, **Affected files**, **Requirements**, **Verification**, and **Done when**. Put that content in the child issue body; do not split it into comments.
3. For a GitHub epic, use that issue as the parent. For a local source, propose one new epic issue using the source title, then make every task a direct child of it.
4. Map only explicit dependencies. `Task B` with `Depends on: Task A` means B is blocked by A. If a task title, dependency target, scope, or local-plan epic title cannot be mapped unambiguously, stop and ask for clarification. Do not invent tasks, dependencies, labels, or metadata.
5. Check for collisions before drafting. GitHub issues cannot be deleted with `gh`, only closed, so a duplicate child is manual cleanup for the user and this skill must never create one by accident. Compare every proposed child title from step 2 against the titles of the epic's existing sub-issues, open and closed alike:

   - No existing sub-issues: proceed; this is a first run.
   - Every proposed title already exists: stop. Report that the graph is already populated and change nothing.
   - Some titles exist and some do not: stop. List which proposed children already exist (with URLs) and which are new, then ask the user whether to create only the missing children, or to abort. Do not choose for them.

   For a local source the epic does not exist yet, so check whether a previous run already created it before proposing a new one:

   ```bash
   gh issue list --repo <OWNER/REPO> --state all --search "<Epic Title> in:title" --json number,title,url
   ```

   `in:title` matches loosely, so treat the results as candidates, not answers: compare the returned `title` values yourself and only count an exact string match as a collision. If one exists, stop and ask whether to use that issue as the epic, or to abort. Do not create a second epic with the same title.

   Carry the collision result into the draft gate. Never re-create a child or an epic that already exists.

## Mandatory Draft Gate

Before any `gh issue create` or `gh issue edit` mutation, present a draft containing:

| Source task | Proposed issue title | Parent epic | Blocked by | Body retained | Status |
| --- | --- | --- | --- | --- | --- |
| Task N | exact title | issue URL/number or proposed epic | explicit task IDs | Objective, Context, Affected files, Requirements, Verification, Done when | new, or already exists (URL) |

Also show the dependency edges in `blocked ← blocker` form and list every unmapped or ambiguous source section. Ask for explicit confirmation. A draft is read-only; do not create issues until the user confirms it.

State the `gh` version and target repository above the table so the user can see where the mutations will land. If any row is `already exists`, say so explicitly in the confirmation request rather than burying it in the table.

## Create and Wire the Confirmed Graph

After confirmation, make one mutation at a time and record every returned issue URL and number. Create only the children the user confirmed; skip any row marked `already exists`.

Issue bodies go in temporary files so Markdown survives shell quoting. This skill has no `Write` tool, so create them with a Bash heredoc in a scratch directory outside the repository — never in the working tree, where a body file can be committed by accident:

```bash
BODY_DIR="$(mktemp -d)"
cat > "$BODY_DIR/task-1.md" <<'EOF'
<verbatim task body>
EOF
```

Quote the heredoc delimiter as `<<'EOF'` so backticks, `$`, and code fences in the body are not expanded by the shell. Remove the directory with `rm -rf "$BODY_DIR"` once every issue is created and verified.

1. For a local source, create the confirmed epic first and record its URL/number:

   ```bash
   gh issue create --repo <OWNER/REPO> --title "<Epic Title>" --body-file "$BODY_DIR/epic.md"
   ```

2. Create each confirmed child with its full, verbatim structured task content in the body. Every child-creation command must explicitly include the resolved `--repo <OWNER/REPO>`:

   ```bash
   gh issue create --repo <OWNER/REPO> --parent <EPIC> --title "<Task Title>" --body-file "$BODY_DIR/task-N.md"
   ```

   Do not add task content through issue comments.

3. Translate every confirmed dependency only after all child URLs/numbers are known:

   ```bash
   gh issue edit <CHILD> --repo <OWNER/REPO> --add-blocked-by <BLOCKER>
   ```

4. If any GitHub mutation fails, stop immediately. Report the exact command/error and the issue URLs already created; do not continue or guess at recovery. Leave the scratch directory in place and name its path in the report, so a resumed run can reuse the bodies instead of regenerating them.

5. Verify the resulting hierarchy and graph:

   ```bash
   gh issue view <EPIC> --repo <OWNER/REPO> --json subIssues,blockedBy,blocking
   gh issue view <CHILD> --repo <OWNER/REPO> --json parent,subIssues,blockedBy,blocking
   ```

   Confirm every child's `parent` is the epic and every explicit edge appears in the relevant `blockedBy`/`blocking` data. Stop and report any mismatch.

## Dependency Mapping Example

If a source task says `Task B` **Depends on** `Task A`, draft `B ← A` and create the corresponding native blocking relationship. Always derive every edge from the current source; never reuse an example graph, issue number, repository, or task mapping from a prior run.

## Completion Output

Report the epic URL, each created child URL/number, the verified `blocked ← blocker` edges, and any source sections deliberately not mapped. Do not claim completion until the GitHub verification output confirms the hierarchy and dependency graph.
