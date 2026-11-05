# GitHub Surface Reference

> The `plan-to-graph` skill loads this during the GitHub surface probe (before drafting).
> SKILL.md names only abstract operations. This file is the only place that binds them
> to concrete tools. Example MCP names below are examples, not required calls — bind
> whichever tools the harness actually exposes after reading their schemas.
>
> A surface qualifies only if it can do all three graph capabilities. Emulating a
> missing one with labels, body checklists, or comments produces a wrong graph.

## Detect a CCR-proxy session

Run this check before considering `gh`. It prints a label or nothing — it does not print token values.

```bash
{ [ "$CLAUDE_CODE_REMOTE" = true ] || [ "$GH_TOKEN" = proxy-injected ] || [ "$GITHUB_TOKEN" = proxy-injected ]; } && echo ccr-proxy || true
```

Output means CCR-proxy. Treat the session as CCR-proxy. `proxy-injected` is not a PAT. Never `curl` GitHub with it, never pass it to a script as a token, and never `apt install gh` as this skill's fix.

If you did not run this check, do not bind `gh`. Continue to harness tools.

## Probe (once)

Probe in this order. Record the outcome of every step. Stop binding once one path is chosen.

1. Run the CCR check above. If it prints anything, `gh` is **not** a candidate — skip step 2 and go to step 3 even if `gh` is installed.
2. If **not** CCR-proxy: `command -v gh` and `gh auth status`. Both must succeed or `gh` is absent — continue to step 3. Do not abort. `jq` is **not** required. If both succeed, run the capability checks below. If every check passes, `gh` is a candidate: skip steps 3–4 and bind `gh` directly at step 5. If any capability check fails, `gh` is not a candidate — continue to step 3 and name the missing flag or field.
3. List the harness's GitHub tools (official GitHub MCP, Claude built-in GitHub tools, or any other connector). Read each schema. Do not infer parameters from a name.
4. Score each harness surface on the **three capabilities the graph needs**, not on op count. A surface that cannot do all three does not qualify.
5. Bind **exactly one** path for the whole run:
   - Prefer `gh` when it is a candidate (local least toil; behavior matches today's `gh`-only run).
   - Otherwise bind a harness surface only if it scored all three capabilities. Ties go to official GitHub MCP over built-in tools.
6. Record: surface name, capabilities bound, capability missing. Do not re-probe. Do not mix surfaces mid-run. After binding, every abstract op this run needs (`resolve_repo`, `read_issue`, `list_issues`, `create_issue`, plus the three capabilities) must exist on that same surface; if one is missing, abort and name it. Never invoke `gh` unless `gh` is the bound surface.

### Three required capabilities

| Capability | Meaning | `gh` check |
| --- | --- | --- |
| `create_child` | create an issue with a native parent | `gh issue create --help` includes `--parent` |
| `add_blocked_by` | add a native `blocked-by` edge between two issues | `gh issue edit --help` includes `--add-blocked-by` |
| `read_graph` | read back `parent`, `subIssues`, `blockedBy`, `blocking` | `gh issue view --help` lists all four JSON fields |

Record the `gh` version when probing `gh`. For a harness surface, confirm each capability from **native schema fields only** — not by attempting a write, and not because an example name in this file looks right. Example MCP names are not evidence that the harness has those ops.

**No surface qualifies:** abort before drafting or mutating. Name every surface probed and the capability each one lacked. Ask the user to provide a surface that supports native sub-issues and blocking relationships. **Never** emulate either relationship with labels, body checklists, comments, or an external tracker.

## Resolve the repository

Parse first, then confirm through the **bound** `resolve_repo` op. Never invoke `gh` unless `gh` is the bound surface.

1. **Full issue URL** → parse `owner`, `repo`, and `number` from the URL. The URL wins over ambient context.
2. **`#N` or bare `N`, or a local file** → require the user to provide `<OWNER/REPO>`; do not infer it from the current checkout.
3. Confirm via bound `resolve_repo`. Stop on ambiguity.

## Abstract operations

| Operation | `gh` | Official MCP (examples) | Built-in / other |
| --- | --- | --- | --- |
| `resolve_repo` | `gh repo view <O/R> --json nameWithOwner,url` | repo-read tool from schema | repo-read tool from schema |
| `read_issue` | `gh issue view <N> --repo <O/R> --json number,title,body,labels,url,subIssues,blockedBy,blocking` | issue-read tool that returns hierarchy fields | issue-read tool from schema |
| `read_graph` | `gh issue view <N> --repo <O/R> --json parent,subIssues,blockedBy,blocking` | same read tool, hierarchy fields | same |
| `list_issues` | `gh issue list --repo <O/R> --state all --search "<title> in:title" --json number,title,url` | issue-list / search tool | list tool from schema |
| `create_issue` | `gh issue create --repo <O/R> --title "<t>" --body-file <path>` | issue-create tool (no parent) | create tool from schema |
| `create_child` | `gh issue create --repo <O/R> --parent <EPIC> --title "<t>" --body-file <path>` | sub-issue / issue-create-with-parent tool | only if the schema can set a parent |
| `add_blocked_by` | `gh issue edit <CHILD> --repo <O/R> --add-blocked-by <BLOCKER>` | issue-edit / dependency tool that adds `blocked-by` | only if the schema can add that edge |

On an MCP binding, pass bodies as parameters. This skill has no `Write` tool; no scratch directory.

On the `gh` binding, create bodies with a Bash heredoc in a scratch directory outside any working tree:

```bash
BODY_DIR="$(mktemp -d)"
cat > "$BODY_DIR/task-1.md" <<'EOF'
<verbatim task body>
EOF
```

Quote the delimiter as `<<'EOF'` so backticks, `$`, and code fences are not expanded. Remove the directory once every issue is created and verified. If a mutation fails, leave it in place and name its path.

## Mid-run failure

Do not switch surfaces if a bound call fails. Stop immediately. Report the exact call/error and the issue URLs already created. Do not continue, retry a create, or guess at recovery.

## Honest scoping

Whether a given harness GitHub surface exposes `create_child` and `add_blocked_by` is answered at probe time, not asserted here. If none does, the run still pays off: the failure is a named capability report instead of "gh not found", and the skill is ready the moment a surface gains those ops.
