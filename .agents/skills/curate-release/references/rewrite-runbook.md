# Rewrite Runbook

The complete non-interactive sequence for Phases 4 through 6, with the recovery path for every failure. There is no editor in this environment: `git rebase -i` will hang or fail, and `git commit` without `-F` or `-m` will do the same. Every commit message goes through a file.

## Setup

Phase 1 already did this, once the metadata gates passed:

```bash
git fetch --tags origin <base_ref> <head_ref>
git checkout -B <head_ref> origin/<head_ref>

BASE=$(git merge-base origin/<base_ref> HEAD)
ORIG=$(git rev-parse HEAD)

git tag -f _precurate "$ORIG"
git config --local curate-release.base "$BASE"
git config --local curate-release.orig "$ORIG"
```

`_precurate` is a local tag and is never pushed. It is the only way back if a later step goes wrong, so it is created before the first destructive command, not after.

Three things about this block are load-bearing:

- **It runs before any analysis, not here.** A session normally starts on a fresh clone of the default branch. Analysis performed before the checkout inspects the base branch instead of the PR — an empty diff and a clean idempotency check rather than an error. Nothing about that failure is visible in the output.
- **`BASE` is pinned once and never recomputed.** The local config values make the pinned SHAs available to later Bash invocations; recover them with `git config --local --get curate-release.base` and `git config --local --get curate-release.orig`. Recomputing the merge-base in a later phase lets a push to the base branch mid-run separate the commit the branch was analyzed against from the commit it is rewritten onto.
- **The base is never advanced.** Do not merge or rebase onto a newer `<base_ref>`: that is a content change disguised as a history change, it can produce conflicts no unattended session should resolve, and it breaks the Phase 5 tree-equality check.

## Unstage everything

```bash
BASE=$(git config --local --get curate-release.base)
ORIG=$(git config --local --get curate-release.orig)
git reset --soft "$BASE"
git restore --staged .
```

`reset --soft` moves the branch pointer back to the merge-base while leaving every file on disk untouched — the working tree is identical to `$ORIG` throughout. It also leaves the entire diff staged, which is why `restore --staged .` follows: the commits are built by staging paths deliberately, one planned commit at a time.

## Build each planned commit

For each commit in the printed plan, in order:

```bash
(
message_file=$(mktemp) || exit 1
trap 'rm -f -- "$message_file"' EXIT

cat > "$message_file" <<'EOF'
<type>(<scope>): <subject>

<body>

Closes #<issue>
Co-authored-by: <preserved from original commits>
Release-Story: curated
EOF

git add -- <paths for this commit>
git commit -F "$message_file"
)
```

Notes:

- Use a quoted heredoc delimiter (`<<'EOF'`) so backticks, `$`, and `!` in the message are not expanded by the shell. `mktemp` creates a private message file instead of trusting a predictable path in `/tmp`; the trap removes it even if the commit fails.
- Stage whole paths. Never use `git add -p`, which is interactive.
- The last planned commit must be the one carrying `Release-Story: curated` on HEAD — every commit gets the trailer, and HEAD's is what the Phase 1 idempotency guard reads on the next run.

After the final commit, nothing may remain unstaged. If `git status --porcelain` is non-empty, the plan did not cover every path in the diff — that is a planning defect, not something to sweep into a trailing commit. Add the missing paths to the commit they belong to by resetting to `_precurate` and rebuilding.

## Verification

Run them in this order; the first is the one that matters most.

```bash
BASE=$(git config --local --get curate-release.base)
ORIG=$(git config --local --get curate-release.orig)
git diff --quiet "$ORIG" HEAD                             # trees identical — MUST exit 0
test -z "$(git status --porcelain)"                       # worktree MUST be empty
test "$(git merge-base origin/<base_ref> HEAD)" = "$BASE"  # base unchanged — MUST exit 0
git log --format=%s "$BASE"..HEAD                         # READ IT — must match the printed plan
```

`git diff --quiet "$ORIG" HEAD` compares the resulting trees, not the commits. Exit 0 proves the rewrite moved commit boundaries without changing a single byte of content. This is the check that catches an accidental edit, a stray formatter run, or a missed file.

The first three are assertions: they exit non-zero on their own when something is wrong. The fourth is not. `git log` exits 0 no matter what it prints, so a commit list that diverges from the plan sails through unless the output is actually read and compared line by line. `git rev-parse "$BASE" HEAD` is not a substitute for the third line — it prints two SHAs and always exits 0, which makes it a display command wearing a check's clothing.

If the repository has commitlint configured, lint the new range before pushing:

```bash
npx commitlint --from "$BASE" --to HEAD
```

Prefer the copy already in the repository's `node_modules`. An unattended routine on a restricted network cannot always reach the registry, and a commitlint that could not run is a line in the Phase 7 report — never a step quietly treated as passed.

Fix violations by rebuilding the commits, not by amending in place — a subject that violates `header-max-length` usually means the plan's subject was too long, and the plan is the record.

## Failure recovery

| Failure | Recovery |
| --- | --- |
| `git diff --quiet "$ORIG" HEAD` exits non-zero | `git reset --hard _precurate`. Push nothing. Report that content was altered. |
| `git status --porcelain` is non-empty | `git reset --hard _precurate`. Rebuild with a plan that covers every path. |
| Commit subjects do not match the plan | `git reset --hard _precurate`. Rebuild. |
| commitlint fails | `git reset --hard _precurate`. Revise the plan's subjects and bodies, then rebuild. |
| `--force-with-lease` is rejected | Someone pushed during this run. `git reset --hard _precurate`. Push nothing. Report. Do **not** retry with `--force`. |

Every row ends the same way: the remote is exactly as it was, and the operator gets a report instead of a surprise.

## Push

```bash
git push --force-with-lease="<head_ref>:$ORIG" --force-if-includes origin HEAD:<head_ref>
```

The explicit `<head_ref>:$ORIG` lease is the guard that carries the weight: the push is rejected unless the remote branch still points at the commit this run started from. `--force-if-includes` is belt-and-braces here and is only independently meaningful when the lease is given without an expected value; including it costs nothing.

Never substitute `--force`. A rejected lease means the branch moved underneath this session, and `--force` would destroy whatever was pushed in the meantime.

Push only to `<head_ref>`. Do not merge the PR, approve it, close it, or change its labels — the operator gated this run on a label, and touching labels can retrigger the routine.

## What the force-push costs

Say this in the Phase 7 report every time, because the PR author will notice:

- Existing approvals are dismissed if the repository has "dismiss stale reviews" enabled.
- Line-level review comments detach from their diff positions and become harder to follow.
- Anyone with the old branch checked out needs `git fetch && git reset --hard origin/<head_ref>`.

None of these is a reason to skip curation on a PR that is about to merge, but all three are reasons to run it once, at the gate, rather than repeatedly.
