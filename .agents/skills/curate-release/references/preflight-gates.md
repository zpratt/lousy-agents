# Preflight Gates

Phase 1 decides whether this run may write anything at all. A gate that aborts leaves the remote, the PR, and the local branch untouched.

The gates split by what they need. The first three read only PR metadata and are evaluated before any git command runs. The idempotency gate reads commits, so it runs after Phase 1 has fetched the branch and pinned `BASE` — which is also why that checkout happens inside Phase 1 rather than at the start of Phase 4.

## Aborting gates

| Condition | How to check | Outcome |
| --- | --- | --- |
| PR is closed or merged | PR `state` and `merged` fields | **Abort.** The history is already in the base branch. Rewriting it is destructive and pointless. |
| PR is a draft | PR `draft` field | **Abort.** The branch is still moving. Curation would be stale before it is reviewed. |
| Fork PR | `head_repo` differs from the base repo | **Abort.** This session has no push access to the contributor's fork. Phase 6 would fail after the rewrite. |
| Squash-only repository | `allow_merge_commit`, `allow_rebase_merge`, `allow_squash_merge` | **Cancel the rewrite, keep the analysis.** Curated commits are discarded at merge. See below. |
| Already curated | Every commit in `"$BASE"..HEAD` parses as a Conventional Commit **and** HEAD carries `Release-Story: curated` | **Abort.** Idempotency guard. Label events refire and a second rewrite would churn the branch for nothing. |

Report the specific gate that fired and stop. Do not attempt a partial run. The one exception is the squash-only row, which is not an abort: it suppresses Phase 4 onward while leaving Phases 2–3 to run, because its whole product is the proposal below.

### The idempotency guard

Both halves must hold. A branch where every subject happens to look conventional but no trailer is present has not been curated by this skill — a human may have written good messages that still do not tell a release story, and the trailer is the only reliable marker. Check the trailer on HEAD, not on every commit: HEAD is the last commit this skill authors, so its trailer proves the run reached Phase 4 completion.

### Squash-only repositories

When squash is the only enabled merge strategy, individual commits never reach the base branch — GitHub composes one commit from the PR title and body. Rewriting the branch would accomplish nothing and would still dismiss approvals.

Do the analysis anyway (Phase 2 and Phase 3), then post a PR comment instead of rewriting:

```markdown
This repository merges by squash only, so individual commits are discarded at merge time.
Curating the branch would dismiss approvals without changing what semantic-release sees.

Proposed squash title:

    <type>(<scope>): <subject>

Proposed squash body:

    <body>

    <footers, including BREAKING CHANGE: and Closes #N>

Setting the PR title and body to the above makes the squash commit release-bearing
(<release type>) on the <channel> channel.
```

Then stop. Do not edit the PR title or body yourself — that is a write the operator did not ask for, and the title is the reviewer's text.

## Warning conditions — flag, do not abort

These do not block the rewrite. Carry each one into the Phase 7 report so the operator learns about it at the same time they learn the history changed.

**Base branch is not in the `branches` config.** Merging publishes nothing. The curation is still worth doing for whenever the branch flows onward into a release branch, but say so plainly rather than implying a release will follow.

**Base branch is a maintenance line (`1.x`, `1.2.x`) and the plan contains a `feat` or a breaking change.** semantic-release refuses version increments that conflict across branches, so a minor or major bump landing on a maintenance line is likely to fail the release run rather than produce a version. Report the conflict and name the commit that causes it. Do not silently downgrade the type to make the release succeed — the type must describe the change, and the operator needs to see the conflict to decide whether the work belongs on this branch at all.

## Resolution failures

If Phase 0 cannot resolve the PR from an explicit argument or the event context, and matching open PRs on head SHA is still ambiguous, stop with "could not resolve the target PR" — the same wording Phase 0 uses, so the abort reason is greppable. Two PRs can share a head SHA when one branch was cut from another. Guessing means rewriting the wrong branch, which is unrecoverable for whoever owns it.
