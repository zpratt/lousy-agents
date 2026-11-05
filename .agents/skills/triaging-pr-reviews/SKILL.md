---
name: triaging-pr-reviews
description: Use when triaging or analyzing PR review comments — especially from automated reviewers like GitHub Copilot — to classify root concerns, verify claims against actual code, evaluate trade-offs, and decide what to implement, reject, or implement differently. Also use to process or respond to review feedback, handle Copilot suggestions, or sort through code review comments
argument-hint: "PR number to analyze (e.g., #317). Optionally specify a source filter: 'copilot', 'human', or 'all' (default: all)"
allowed-tools: Bash, Read, Grep, Edit, Write, mcp__github
---

# Triaging PR Reviews

## Overview

PR review comments — especially from automated reviewers — are hypotheses, not instructions. Each claim must be verified against the actual codebase before action.

**Core principle:** Verify the claim, classify the concern, evaluate the trade-off, then act. Never implement a suggestion you haven't traced through the code.

## When to Use

- PR has pending review comments (human or automated) that need analysis
- Automated reviewer (Copilot, CodeRabbit, etc.) generated suggestions
- Multiple review comments need prioritization before action
- Review feedback seems technically questionable or conflicts with existing patterns
- A merged or closed PR still carries unanswered threads worth understanding — triage runs, but Phase 6 stops and asks before any code is written

**Do NOT use when:**
- Writing a new review or providing review comments on someone else's PR
- The PR has no pending review comments to analyze

## Prerequisites

One GitHub read surface, bound once before Phase 1. Load [`references/github-surface.md`](./references/github-surface.md) and run its probe. Local sessions with authenticated `gh` and `jq` use `gh`. Claude Code cloud sessions, and any session without `gh`, use the harness's GitHub MCP or built-in GitHub tools.

If the probe finds no read surface, abort and name every probe that failed. Do not install `gh` to recover.

If — and only if — the probe binds `gh`, also load [`references/gh-binding.md`](./references/gh-binding.md) for that path's concrete commands. Every other binding never needs it.

## GitHub surface

Later phases name only these operations. The reference binds each one to the surface chosen in the probe.

| Operation | Meaning |
| --- | --- |
| `read_pr` | PR title, body, branches, url, and whether the PR is open, merged, or closed-unmerged. Those are three states, not two: some surfaces fold merged into `state`, others report `state: closed` with a separate `merged` flag. The reference says which |
| `list_review_comments` | Inline review comments: body, author, path, line, created_at, and whatever identity the surface carries — a numeric id, a review id, an `in_reply_to_id`. Surfaces differ; the reference says which fields each one actually supplies and how to work without the rest |
| `list_review_threads` | Review threads: thread id, `isResolved`, and **every** comment id in the thread |
| `list_reviews` | Review summaries (id, user, state, body, submitted_at) |
| `list_pr_comments` | Conversation-tab comments, **read only** — a PR is backed by an issue, so review direction often lands here |
| `reply_in_thread` | Reply in a review thread, never as a top-level PR comment |
| `resolve_thread` | Mark an addressed review thread resolved |

Bind exactly one read path and one write path. Do not mix surfaces mid-run. Phase 7 covers what to do when a write op can't be bound.

## Procedure

```
PROBE → DISCOVER → TRIAGE → VERIFY → CLASSIFY → EVALUATE → IMPLEMENT → RESOLVE
```

Probe first (see Prerequisites). Each later phase builds on the previous. Do not skip phases — automated reviewers frequently make claims that don't hold up under verification.

---

### Phase 1: Discovery

Fetch all PR context through the bound surface (see [`references/github-surface.md`](./references/github-surface.md)):

1. `read_pr` — title, body, branches, url, and whether the PR is open, merged, or closed-unmerged. Record which of the three it is — it changes what Phases 6 and 7 may do. Re-read it at the top of Phase 6 if triage took a while: a PR can merge underneath a long run. `state: closed` alone does not distinguish merged from abandoned — check the surface's merged flag before concluding.
2. `list_review_comments` — the actual inline feedback; exhaust every page
3. `list_review_threads` — which threads are already resolved; exhaust every page
4. `list_reviews` — approval state per reviewer; exhaust every page
5. `list_pr_comments` — conversation-tab comments; exhaust every page

Join every inline comment to its thread's `isResolved` using the thread's full comment list. A thread's later comments are usually the replies, so matching on the first comment alone loses the join for everything else in that thread.

Order comments and reviews by timestamp, newest first. Ordering is presentation only — it never decides what Phase 2 triages.

`read_pr`, `list_review_comments`, `list_review_threads`, and `list_reviews` are backbone. If any of them fails, abort — implement nothing, resolve nothing. Without `list_review_threads` the skill re-triages threads a previous round already closed.

`list_pr_comments` is enrichment. If the bound surface exposes no issue-comment reader, or the call fails, degrade that one op, name it in the report, and continue. A PR with no conversation-tab comments is the ordinary case; losing that read costs less than refusing to triage at all.

Never let a degraded read pass silently. Discovery that returns less than the PR holds reads as "nothing left to address".

---

### Phase 2: Triage

**Separate by source:**
- **Human reviewers** — higher trust, likely reflects project intent
- **Automated reviewers** (Copilot, bots) — treat as hypotheses requiring verification

**Triage every unresolved comment.** Grouping organizes the work; it never decides what gets triaged. That was the original defect: one review's comments do not share a `created_at`, so a timestamp-keyed batch silently left part of a submitted review untriaged. Narrowing to "the latest batch" is what dropped feedback, so scope is now every comment whose thread is unresolved, every conversation-tab comment, and every review summary body. All three are feedback; enumerating only some of what Discovery fetched is how feedback goes missing.

**Group for presentation:**
- Group by **review id** when the bound surface supplies one, ordering groups by the review's `submitted_at` from `list_reviews`, newest first.
- Not every surface supplies one, and the reference says which do. When it is unavailable, group by author, say that grouping is approximate, and move on — never fall back to `created_at` as a grouping key, and never narrow what you triage to compensate.
- A standalone inline reply belongs to a thread. Keep the thread together even when the fallback key would split it — a reply and the comment it answers are one conversation, and author grouping is the approximation, not the truth.

**Drop what a previous round already closed:**
- A comment whose thread is resolved was addressed already — the flag is `isResolved` on GraphQL and may be `is_resolved` on a harness tool; match the surface, not the spelling used here. Exclude it from triage — do not re-verify, re-implement, or re-reply.
- Unless the thread carries a comment newer than the resolution. A reviewer who resolves optimistically and then follows up is still waiting on an answer.
- Not every surface dates the resolution. When it exposes only a resolved flag, this exception cannot be evaluated: exclude on the flag alone and say that a late follow-up on a resolved thread would have been missed. Do not guess from comment order.
- Report how many comments were excluded this way. An unexplained shortfall looks like comments went missing.

**Conversation-tab comments:**
- Triage them with the same verification bar as inline comments. A reviewer's substantive direction is often left here rather than on a line.
- They belong to no review thread — unlike a standalone inline reply, which does. So they can be neither resolved nor replied to in-thread. Report their outcome to the user instead, and never answer one with a top-level PR comment.
- Review summary bodies are the same shape: substantive feedback with nothing to resolve. Triage and report them the same way.
- Neither lane carries resolution state, so nothing marks them handled. Say which ones you addressed in this run, so a later round can tell them from new ones.

**Filter out noise:**
- Process comments (PR scope, description suggestions) — flag for human, skip technical analysis
- Duplicate concerns across reviews — deduplicate to the most recent instance

**Present to user:** Count of comments by source and category, how many were excluded as already resolved, and any read that degraded. Ask which to address if scope is unclear.

---

### Phase 3: Verification

For each technical comment, read the actual code before forming any opinion:

1. **Read the cited file and line** — open the exact path and line range cited by the reviewer. Does the code match what the reviewer describes?
2. **Read the associated test file** — locate the corresponding test file (e.g., `**/*.test.*`) and check existing coverage for this path.
3. **Search for codebase patterns** — search the codebase for other usages of the pattern the reviewer suggests. Does the codebase already use it, or deliberately avoid it?
4. **Trace the code path** — search for callers of the affected function or module. Can the scenario the reviewer describes actually be triggered by current callers?

---

### Phase 4: Classification

Categorize the root concern driving each comment:

| Category | Signal | Example |
| --- | --- | --- |
| **Security** | Injection, traversal, untrusted input, control chars | "Error message embeds unsanitized input" |
| **Correctness** | False positives/negatives, edge cases, logic bugs | "`includes('..')` rejects valid names like `..foo`" |
| **Performance** | Hot paths, unnecessary allocations, blocking calls | "Awaiting telemetry blocks the critical path" |
| **Style** | Readability, naming, idiomaticity | "This code is a bit terse" |
| **Architecture** | Layer violations, coupling, wrong abstraction level | "Business logic in adapter layer" |

**Look for shared root concerns** — multiple comments often stem from one underlying issue.

---

### Phase 5: Evaluation

For each verified claim, assess these questions:

| Question | Why It Matters |
| --- | --- |
| Is the claim technically correct for THIS code? | Automated reviewers lack full context |
| Can this scenario actually be triggered? | Latent bugs vs active vulnerabilities |
| Would the suggested fix break existing tests? | Especially security and regression tests |
| Does the suggestion conflict with a deliberate design choice? | Hand-rolled code often exists for a reason |
| Is removing code better than fixing it? | Redundant checks that only produce false positives |
| Is there a simpler alternative the reviewer didn't consider? | Reviewer optimizes locally; you see globally |

#### The Deliberate Design Trap

Automated reviewers cannot know WHY code was written a certain way. Before implementing "more idiomatic" or "simpler" suggestions:

```
Search for tests that validate the CURRENT behavior.
If a test exists that would break with the suggestion,
the current code is likely deliberate.
Investigate WHY before changing.
```

**Example:** A reviewer suggests replacing a hand-rolled glob matcher with regex for readability. The codebase has a ReDoS resistance test proving the hand-rolled approach was chosen to prevent catastrophic backtracking on untrusted input. The "improvement" would introduce a security vulnerability.

#### Validity Verdicts

- **Implement as-suggested** — claim is correct, fix is appropriate
- **Implement differently** — claim is correct, but a better fix exists (e.g., remove redundant code instead of tightening it)
- **Reject with reasoning** — claim is incorrect, or fix would cause harm
- **Defer to user** — architectural decision or ambiguous trade-off

---

### Phase 6: Implementation

**If the PR is merged or closed, stop and ask before writing any code.** Triage still had value — unresolved feedback outlives a merge, and a closed PR can carry threads nobody answered — but implementation does not follow from it:

- **Merged.** The head branch may be deleted or long diverged, and a commit pushed to it changes nothing that ships. The fix belongs on a new branch off the default branch, or in a follow-up issue. Report the triage, name the target you would use, and let the user choose. Filing the issue is not this skill's job — it binds no issue-write operation and the probe is sealed by then; hand the user the text instead.
- **Closed unmerged.** The work was abandoned. Report the triage and ask whether the PR is being revived or the feedback should move to an issue.

On an open PR, continue.

Shell permission is granted per command, so a probe command that was denied says nothing about the test command. Do not skip the fix or its tests on that basis: run the tests, and call a fix untested only when the test command itself is denied.

**Priority order:**
1. Security (active vulnerabilities, injection, traversal)
2. Correctness (bugs triggerable by current callers)
3. Latent correctness (bugs not yet triggerable but worth hardening)
4. Style (readability, naming — only if user requests)

**Per fix:**
1. Write a failing test demonstrating the edge case the reviewer identified
2. Verify it fails for the right reason (confirms the bug exists)
3. Implement the minimal fix, with no code comment explaining it — the test pins the case and the thread reply carries the why
4. Verify all tests pass (new and existing)
5. After all fixes: run the project's full validation suite

---

### Phase 7: Resolution

Use the write bindings recorded during the probe. Reload [`references/github-surface.md`](./references/github-surface.md) only if that binding is no longer in context.

**On a merged or closed PR, write nothing here.** Not a reply, not a resolve — including when the user approved a fix on some other branch. A commit that is reachable on GitHub is still not in *this* PR, and a thread closed with `Fixed in {sha}` tells every later reader that the merged code contains the fix. Report which branch or issue the work landed on and leave the threads open for the user to close. The rest of this phase applies to open PRs.

**Reply in the review thread** (not as a top-level PR comment) with `reply_in_thread`:

`Fixed in {sha}. {Brief description of what changed and why.}`

Never build that reply into a shell command string. A body containing a backtick, `$`, or a code fence — which a reply describing a code change usually does — is re-interpreted by the shell before it ever reaches the API. On an MCP or built-in binding the body is a parameter and quoting never applies; on the `gh` binding it goes in a file, and [`references/gh-binding.md`](./references/gh-binding.md) gives the exact form.

**Resolve each addressed thread** with `resolve_thread`.

**Leave unresolved:** process-only comments, items deferred to user, and rejected items awaiting discussion.

Never reply `Fixed in {sha}` for a commit that did not land somewhere the reader can reach, and never resolve a thread whose feedback you did not act on.

If `reply_in_thread` or `resolve_thread` is unbound or returns a 403 / GraphQL pin error, skip that write, leave the thread open, and disclose the degradation. Do not post a top-level PR comment as a substitute.

---

## Edge Cases

### Automated Reviewer Hallucinations

Automated reviewers sometimes:
- Cite line numbers that don't match the actual code
- Describe behavior that can't occur given the actual control flow
- Suggest fixes that introduce the very vulnerability they claim to prevent
- Flag "issues" in code that was already fixed in a later commit in the same PR

**Always read the code.** If the reviewer's description doesn't match what you see, trust the code.

### Massive Review Batches (10+ comments)

- Deduplicate: multiple comments often describe the same root issue from different angles
- Prioritize: security > correctness > everything else
- Batch related fixes into a single commit when they share a root cause
- Present the grouped analysis to the user before implementing

### Conflicting Suggestions

When two comments suggest contradictory fixes:
- Identify which is more technically sound
- Check if one accounts for context the other missed
- Escalate to user if genuinely ambiguous

### Cross-Platform Concerns

Automated reviewers frequently flag Windows/POSIX compatibility. Before implementing:
- Check if the project actually targets Windows (CI matrix, `engines` field)
- If not, note the scope mismatch in the rejection reasoning

---

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Implementing without reading the code | Always verify the claim at the cited line |
| Treating bot suggestions as requirements | They are hypotheses — verify each one |
| Missing deliberate design choices | Search for tests that validate current behavior |
| Fixing redundant code instead of removing it | If downstream checks are strictly better, delete the redundant check |
| Replying as top-level PR comment | Always reply in the review thread. Reading conversation-tab comments is required; writing one is still forbidden |
| Batching by `created_at` | One review's comments do not share a timestamp. Group by review id where the binding supplies one, author otherwise — and never let grouping decide what gets triaged |
| Binding an issue-comment **write** tool | The surface exposes one next to the reader you need. Bind the reader only |
| Re-triaging a resolved thread | Join `isResolved` in Discovery and exclude resolved comments |
| Interpolating a reply body into a shell command | Write it to a file and pass the file; backticks and `$` get expanded otherwise |
| Resolving threads you rejected | Leave unresolved for user to close |
| Batch-implementing without testing each | Test each fix individually, then full validation |
| Running `gh` before the probe, or on a CCR-proxy session | Bind once from [`references/github-surface.md`](./references/github-surface.md); run the CCR check first and skip `gh` if it prints anything |
| Treating `proxy-injected` as a token | It is a placeholder. Never curl with it. Degrade writes you cannot bind |
