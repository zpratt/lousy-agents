# Preflight Gates

Phase 1 decides whether this run may write anything at all. A gate that aborts leaves the remote, the PR, and the local branch untouched.

The gates split by what they need. The metadata gates read only PR metadata and are evaluated before any git command runs. The workspace gates read the local clone and run before the rewrite worktree is created. The idempotency gate reads commits, so it runs in that worktree after Phase 1 has fetched the branch and pinned `BASE` — which is also why the worktree is created inside Phase 1 rather than at the start of Phase 4.

## Aborting gates

| Condition | How to check | Outcome |
| --- | --- | --- |
| PR is closed or merged | PR `state` and `merged` fields | **Abort.** The history is already in the base branch. Rewriting it is destructive and pointless. |
| PR is a draft | PR `draft` field | **Abort.** The branch is still moving. Curation would be stale before it is reviewed. |
| Fork PR | `head_repo` differs from the base repo | **Abort.** This session has no push access to the contributor's fork. Phase 6 would fail after the rewrite. |
| Squash-only repository | `allow_merge_commit`, `allow_rebase_merge`, `allow_squash_merge` | **Cancel the rewrite, keep the analysis.** Curated commits are discarded at merge. See below. |
| Uncommitted tracked changes | `git status --porcelain --untracked-files=no` prints anything | **Abort.** Someone is mid-edit in this clone. See below. |
| `origin` is another repository, or more than one | `git remote get-url --all origin` or `git remote get-url --push --all origin` prints more than one URL, or one that does not end in `<owner>/<repo>` | **Abort.** The lease protects the branch from concurrent pushes, not from a wrong or extra destination. |
| Fetched head is not the PR head | `git rev-parse refs/remotes/origin/<head_ref>` differs from `head_sha` | **Abort.** Wrong repository, or the branch moved after Phase 0. Do not re-resolve and continue. |
| Local branch holds unpublished commits | `refs/heads/<head_ref>` exists and is not an ancestor of `refs/remotes/origin/<head_ref>` | **Abort.** The force-push would strand them. Use the full ref names: a same-named tag otherwise wins the lookup and the check passes. |
| Already curated | Every commit in `"$BASE"..HEAD` parses as a Conventional Commit **and** HEAD carries `Release-Story: curated` | **Abort.** Idempotency guard. Label events refire and a second rewrite would churn the branch for nothing. |

Report the specific gate that fired and stop. Do not attempt a partial run. The one exception is the squash-only row, which is not an abort: it suppresses Phase 4 onward while leaving Phases 2–3 to run, because its whole product is the proposal below.

### The workspace gates, and why the rewrite runs in a worktree

Every recovery path in this skill ends in `git reset --hard "$ORIG"`, and `ORIG` is only the PR's head commit. Run in the clone's own working tree, the rewrite put three kinds of local work in reach of that reset, each reproduced:

- An uncommitted edit to a file both branches share rides along through the checkout and the soft reset, then lands in a planned commit or is left over. Either failure prescribes the hard reset, and the edit is gone.
- An ignored local file (a `.env`, a local config) at a path the PR branch tracks is silently overwritten by `git checkout`, which replaces ignored files by default.
- An untracked local file at a path the PR **deletes** looks like a modification once `reset --soft "$BASE"` puts the path back in the index; staging the path commits the local bytes, tree equality fails, and the hard reset deletes the file.

Gating each case is whack-a-mole; detecting it afterwards cannot restore the lost bytes. So the rewrite never runs there. Phase 1 creates a detached worktree at the PR head in a fresh run directory under `.git/curate-release/`, and every checkout, reset, commit, and the push happen in it. Every command that creates or re-enters it fails closed and proves it is inside the linked worktree before anything destructive runs; a failed `cd` that silently stays in the clone would undo the whole point. It holds only the PR's own files, so nothing a reset does can reach anyone's work, and the clone's checked-out branch never moves. Untracked and ignored files in the clone — including the stub files a sandbox places in every workspace — are simply never touched.

The two local gates that remain are about the owner's unpublished work, not about the reset: uncommitted tracked changes mean someone is mid-edit, and unpublished local commits on `<head_ref>` would be stranded by the force-push. Do not stash, commit, or `git clean` to get past either: in an unattended run nobody is present to restore what you moved, and the owner of that work did not ask for it to be touched. Report the paths or the unpublished commits and stop.

The remote gates bind the destination, and they read every URL: `git remote get-url` without `--all` prints only the first, but `git push origin` pushes to each configured push URL in turn. Phase 0 resolved `<owner>/<repo>` from a PR URL or event, but every git command talks to `origin`. Invoking the skill from a clone of one repository with a PR URL from another, where the branch name happens to exist in both, would otherwise fetch, rewrite, and force-push the wrong repository — with a lease that passes, because the lease only compares the branch against the commit this run fetched from that same wrong remote. The URL check catches the plain mismatch; the head-SHA check catches a remote whose URL looks right but whose branch is not the PR's (a mirror or a fork with the same name).

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

**The next release would fall outside the range `<base_ref>` may publish.** Maintenance branches, and every release branch except the last one in `branches`, publish only versions inside a bounded range; a release outside it fails with `EINVALIDNEXTVERSION` rather than producing a version. The range depends on existing releases, not on the branch name: `1.x` usually accepts minor releases, `1.2.x` accepts only patches, and neither accepts a major. Compute the accepted bumps with the procedure in `./references/release-typing.md`, then compare the **combined** bump — the largest of this PR's planned commits and the commits already queued since the last release. Warn only when that bump is not accepted, and name the commit that drives it (it may be a queued commit, not one of this PR's). Do not silently downgrade a type to make the release succeed — the type must describe the change, and the operator needs to see the conflict to decide whether the work belongs on this branch at all.

## Resolution failures

If Phase 0 cannot resolve the PR from an explicit argument or the event context, and matching open PRs on head SHA is still ambiguous, stop with "could not resolve the target PR" — the same wording Phase 0 uses, so the abort reason is greppable. Two PRs can share a head SHA when one branch was cut from another. Guessing means rewriting the wrong branch, which is unrecoverable for whoever owns it.
