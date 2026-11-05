# GitHub Surface Reference

> Load this during the GitHub surface probe (before Phase 1). Reload in Phase 7 only if
> the recorded binding has fallen out of context. SKILL.md names only abstract operations.
> This file is the only place that binds them to concrete tools. Example MCP names below
> are examples, not required calls — bind whichever tools the harness actually exposes
> after reading their schemas.

## Resolve the target

Do this before any GitHub call.

1. **Full PR URL** → parse `owner`, `repo`, and `number` from the URL. The URL wins over ambient context.
2. **`#N` or bare `N`** → take `number` from the argument. Resolve `owner`/`repo` from a single unambiguous `origin` remote (`git remote get-url origin`).
3. **Ambiguous or absent repository** — more than one candidate remote, no remote, a fork whose upstream also matches, or no PR number — **stop and ask**. Do not guess.

## Detect a CCR-proxy session

Run this check before considering `gh`. It prints a label or nothing — it does not print token values.

```bash
{ [ "$CLAUDE_CODE_REMOTE" = true ] || [ "$GH_TOKEN" = proxy-injected ] || [ "$GITHUB_TOKEN" = proxy-injected ]; } && echo ccr-proxy || true
```

Output means CCR-proxy. Treat the session as CCR-proxy. `proxy-injected` is not a PAT. Never `curl` GitHub with it, never pass it to a script as a token, and never `apt install gh` as this skill's fix.

If you did not run this check, do not bind `gh`. Continue to harness tools.

## Probe (once)

Probe in this order. Record the outcome of every step. Stop binding once one read path and one write path are chosen.

1. Run the CCR check above. If it prints anything, `gh` is **not** a candidate — skip step 2 and go to step 3 even if `gh` is installed.
2. If **not** CCR-proxy: `command -v gh`, `command -v jq`, and `gh auth status`. All three must succeed for `gh` to be a candidate. If `gh` is a candidate, skip steps 3-4 and bind `gh` directly at step 5 — do not enumerate harness tools when `gh` will win anyway. Missing `gh`, missing `jq`, or failed auth means `gh` is absent — continue to step 3. Do not abort.
3. List the harness's GitHub tools (official GitHub MCP, Claude built-in GitHub tools, or any other connector). Shortlist a candidate for each operation — names and descriptions are fine for narrowing, and a harness that loads schemas on demand may expose dozens of GitHub tools. Then **read the schema of every tool you are about to bind, before binding it**: a name tells you which schema to open, never what a tool accepts. If a candidate's schema does not carry the operation, go back to the shortlist rather than binding it and hoping. The same duty applies to ruling an operation **out**: never score a backbone op as unavailable — and never abort on that basis — without opening the schema that would have disproved it. A tool's name routinely understates it; `pull_request_read` sounds like one call and carries five of the seven operations in its `method` enum.
4. Score each harness surface on the ops it can actually perform. `read_pr`, `list_review_comments`, `list_review_threads`, and `list_reviews` are **backbone**: a surface missing any of them does not qualify as a read path. `list_pr_comments`, `reply_in_thread`, and `resolve_thread` are scored but degradable.
5. Bind **exactly one** read path and **exactly one** write path:
   - Prefer `gh` when it is a candidate (local least toil). On binding it, load [`gh-binding.md`](./gh-binding.md) for that path's concrete commands.
   - Otherwise prefer the higher-scoring **qualifying** surface. Ties go to official GitHub MCP over built-in tools (MCP exposes thread resolve; built-ins often do not).
   - Decide backbone coverage here, not at Phase 1. A surface that binds and then aborts on the first call has wasted the run and told the user nothing useful about why.
6. Record: surface name, ops bound, ops degraded. Do not re-probe. Do not mix surfaces mid-run.

**No qualifying read surface:** abort. Name every surface probed and the backbone op each one lacked — "no GitHub surface" and "this surface cannot read thread resolution state" are different problems with different fixes. Mutate nothing on GitHub.

## Mid-run failure

Do not switch surfaces if a bound call fails.

- `read_pr`, `list_review_comments`, `list_review_threads`, or `list_reviews` fails → abort Discovery. Nothing was implemented or resolved. A partial read is not a smaller review; it is an unreported gap.
- `list_pr_comments` fails or has no binding → degrade that op, name it, continue Discovery. It enriches triage; it is not load-bearing for it.
- `reply_in_thread` or `resolve_thread` fails (missing tool, 403, GraphQL pin) → degrade that op, disclose it, continue the rest of Phase 7.

## Pagination

Exhaust every page. `gh` uses `--paginate`. MCP `get_review_comments` is cursor-based — keep passing `after` until `hasNextPage` is false. Do not stop on a missing `endCursor`: this API returns a non-null cursor on the final page, so that test never fires. Other MCP list methods use `page` / `perPage` — increment until a short page.

The `reviewThreads` GraphQL query paginates too, and a fixed page size silently truncates a PR with more threads than the page holds. Page it on `pageInfo`. Each thread's `comments` connection paginates separately, on every surface — see below for what that means on this binding, and [`gh-binding.md`](./gh-binding.md) (`gh` path only) for the two queries.

## Binding table

The `gh` path has its own file: [`gh-binding.md`](./gh-binding.md). Load it **only if the probe binds `gh`** — on a CCR-proxy or any session without `gh`, it is never needed and should not be read.

| Operation | Official MCP (examples) | Built-in / other |
| --- | --- | --- |
| `read_pr` | `pull_request_read` `method=get` — returns `state: "closed"` for a merged PR, with a separate `merged` boolean. Read both; `state` alone cannot tell merged from abandoned | PR-read tool from schema; confirm from the schema which field carries merged-vs-closed |
| `list_review_comments` | `pull_request_read` `method=get_review_comments` (threads include `isResolved` and comments) | review-comment list tool |
| `list_review_threads` | same call as `list_review_comments` — it already returns threads carrying `isResolved`; keep the thread grouping instead of discarding it when flattening | thread list tool if the schema has one; otherwise no resolution state is available — say so and abort Discovery |
| `list_reviews` | `pull_request_read` `method=get_reviews` | reviews list tool |
| `list_pr_comments` | `pull_request_read` `method=get_comments` (issue comments on the PR, not review comments) — **read only** | issue-comment list tool, **read only**; if none, degrade and disclose |
| `reply_in_thread` | `add_reply_to_pull_request_comment` with **numeric** `commentId` — see MCP ids below | comment/reply tool |
| `resolve_thread` | `pull_request_review_write` `method=resolve_thread` + `threadId` (`PRRT_…`) — see MCP ids below | resolve tool if the schema has one; else degrade |

**Read the conversation tab; never write to it.** The same surface that exposes the issue-comment reader also exposes an issue-comment *writer* (`add_issue_comment` and equivalents). Do not bind it. A reply belongs in its review thread; a comment with no thread is reported to the user, never answered on the PR. This holds in Phase 7 as much as in Phase 1.

### MCP comment and thread ids

A thread's `comments` connection can be truncated independently of the thread list. Page it if the surface exposes a cursor for it; if it does not, say so and treat that thread's comment list as incomplete rather than as the whole thread. Silently accepting a truncated tail loses the `isResolved` join for exactly the comments a long argument ended on.

`pull_request_read` `method=get_review_comments` returns GraphQL threads. Flatten every thread's `comments` before triaging, but carry two fields down onto each flattened comment first: the thread's `isResolved`, and the thread id. Flattening without them is what makes an already-resolved comment look pending.

`get_review_comments` returns threads, while the `gh` path returns a flat comment list — the two bindings hand Phase 2 differently-shaped data.

**Review id is not available on this binding.** The thread-shaped read carries no `pull_request_review_id`, and neither does `get_reviews` expose which comments belong to which review. Say so in the report and group by author instead, per Phase 2. Do not synthesize a review id from timestamps: that is the defect this skill exists to avoid. Nothing about the missing field changes what gets triaged — every unresolved comment does, on every binding.

**Resolution is a bare flag on this binding.** `is_resolved` arrives with no `resolvedAt` or `resolvedBy`, so Phase 2's exception for a thread whose latest comment postdates its resolution cannot be evaluated here. Exclude resolved threads on the flag alone and disclose that limitation, rather than inferring a resolution time from comment order.

- **Reply** needs the REST numeric id. Take it from the comment `url` (`#discussion_r` followed by digits). Do not pass GraphQL `id` (`PRRC_…` / `PRRT_…`) to `add_reply_to_pull_request_comment`. If a comment has no `#discussion_r` id, skip that reply and disclose it.
- **Resolve** needs the thread GraphQL id (`PRRT_…` on the thread, not on a comment). Use that only for `resolve_thread`.
- **Reply bodies** are a parameter on this binding, so shell quoting never applies. Only the `gh` path needs the body in a file.

## Degraded writes

If GraphQL returns `This GraphQL query is not enabled for this session` (or any 403 naming a REST fallback), degrade `resolve_thread`. Do not retry the same query. Do not invent a REST resolve — GitHub has none. Reply in-thread if `reply_in_thread` is bound, leave the thread open, disclose the degradation.
