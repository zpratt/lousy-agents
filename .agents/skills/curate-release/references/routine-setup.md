# Unattended Routine Setup

This skill is written to run with no human in the session. Wiring it to a label event is the intended deployment; these are the settings that make the run succeed instead of failing at Phase 6.

## Trigger

GitHub event → Pull request → `labeled`, with filters:

| Filter | Operator | Value |
| --- | --- | --- |
| Labels | contains | `ready-to-merge` (your gate label) |
| Is draft | equals | `false` |
| Is merged | equals | `false` |
| Base branch | equals | `main` |

The filters duplicate several Phase 1 gates on purpose. Filtering at the trigger avoids burning a session on a PR that would abort immediately; the in-session gates still run because trigger filters are evaluated against the event payload, which can be stale by the time the session starts.

Gate on a label rather than on `opened` or `synchronize`. Curation dismisses approvals, so it belongs at the moment a PR is declared ready — once — not on every push.

## Permissions

Enable **Allow unrestricted branch pushes** for the repository. Without it, pushes are restricted to `claude/`-prefixed branches and Phase 6 fails after the rewrite has already succeeded locally — the worst place to fail, because the operator sees a report of work that did not land.

## Environment

The default trusted environment is sufficient. This skill reads the repository's own config rather than fetching documentation from the network.

If you want a live read of `semantic-release.org` anyway, switch the environment to custom network access, add that host, and keep the default list of common package managers so `npx commitlint` still resolves.

## Tooling

`gh` is not pre-installed in cloud sessions. This skill relies on the built-in GitHub tools plus `git`, so it works as-is. If you want `gh` available for later steps, add `apt update && apt install -y gh` to the environment's setup script; the GitHub proxy authenticates it when `GH_TOKEN` is unset.

## Model

Select a frontier model. Phase 3 is a judgment task and a mistyped `chore` silently suppresses a release — that is precisely the kind of call a smaller model gets wrong in a way nothing downstream catches.

## Connectors

Remove every connector this routine does not need. Connected connectors are included by default and run without approval prompts, which is a large unattended surface for a routine whose only legitimate writes are one force-push and one PR comment.

## Caps

Each matching event starts its own session and sessions are not reused. GitHub webhook events are subject to per-routine and per-account hourly caps. The Phase 1 idempotency guard is what keeps label churn — remove, re-add, remove — from burning those caps on repeat runs over an already-curated branch.

## Verifying the wiring

Before pointing this at a real PR, run it against a throwaway branch with deliberately bad commit messages and confirm:

1. The run prints resolved PR values in Phase 0 and the full plan in Phase 3.
2. `git diff --quiet "$ORIG" HEAD` passes — the tree is unchanged.
3. Re-adding the label produces "already curated" and no second push.
4. The PR comment names the release type and the channel, not a bare "minor".

Step 3 is the one people skip and the one that costs the most, because a routine that rewrites on every label event churns the branch and dismisses approvals repeatedly.
