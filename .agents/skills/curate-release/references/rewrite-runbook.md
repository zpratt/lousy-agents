# Rewrite Runbook

The complete non-interactive sequence for Phases 4 through 6, with the recovery path for every failure. There is no editor in this environment: `git rebase -i` will hang or fail, and `git commit` without `-F` or `-m` will do the same. Every commit message goes through a file.

## Setup

Phase 1 already did this, once the metadata gates and the workspace gates passed — no uncommitted tracked changes, exactly one fetch and one push URL for `origin`, both naming `<owner>/<repo>`, a fetched head equal to `head_sha`, and no unpublished local commits on `<head_ref>`. Every ref is spelled out in full (`refs/heads/`, `refs/remotes/origin/`, `refs/tags/`) so a same-named tag or branch cannot win the lookup:

```bash
git fetch --tags origin "+refs/heads/<base_ref>:refs/remotes/origin/<base_ref>" \
  "+refs/heads/<head_ref>:refs/remotes/origin/<head_ref>"

CR="$(git rev-parse --path-format=absolute --git-common-dir)/curate-release" || exit 1
mkdir -p -- "$CR" || exit 1
git worktree prune                                          # forget worktrees whose directories are gone
RUN=$(mktemp -d "$CR/run.XXXXXX") || exit 1                 # fresh per run: never reused, never rm -rf'd
printf '%s\n' "<owner>/<repo>#<pr_number> <head_sha>" > "$RUN/target" || exit 1
git worktree add --detach "$RUN/worktree" refs/remotes/origin/<head_ref> || exit 1
cd "$RUN/worktree" || exit 1
test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || exit 1        # in a working tree rooted here
test "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" || exit 1  # linked worktree, not the clone
test "$(git rev-parse HEAD)" = "<head_sha>" || exit 1                   # on the PR head
BASE=$(git merge-base refs/remotes/origin/<base_ref> HEAD) || exit 1
ORIG=$(git rev-parse HEAD) || exit 1
git update-ref "refs/curate-release/${RUN##*/}" "$ORIG" "" || exit 1     # this run's safety ref; create-only
printf '%s\n' "$BASE" > "$RUN/base" || exit 1
printf '%s\n' "$ORIG" > "$RUN/orig" || exit 1
echo "RUN=$RUN"                                                         # this run's identity — keep it
```

Setup prints `RUN=<path>`, this run's identity. Every block below starts with this prefix, with that literal path in place of `<run_dir>`; it re-enters the worktree and reloads the pins:

```bash
RUN='<run_dir>'                                       # the literal path setup printed; never looked up
test "$(cat "$RUN/target")" = "<owner>/<repo>#<pr_number> <head_sha>" || exit 1
cd "$RUN/worktree" || exit 1
test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || exit 1
test "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" || exit 1
BASE=$(cat "$RUN/base") && ORIG=$(cat "$RUN/orig") || exit 1
test "$(git rev-parse --verify "refs/curate-release/${RUN##*/}")" = "$ORIG" || exit 1
```

Every line ends in `|| exit 1`, and a non-zero exit from either block is a stop. Without the guards, a failed `worktree add` or `cd` leaves the shell in the clone's own checkout — where the HEAD check still passes if the clone sits at the PR head — and every later reset runs there. The `--show-toplevel` and linked-worktree checks prove where the shell is. Each run gets a fresh `mktemp -d` directory, so a locked or half-removed worktree from an earlier run can never collide with it; never clear one with `rm -rf`.

Use `--git-common-dir` to find `.git/curate-release/`: inside a linked worktree the git dir is `.git/worktrees/<name>`, while the run directory — pins, messages, and the worktree itself — lives in the shared git directory. The linked-worktree check compares the two on purpose: they are equal only in the clone.

The run's safety ref `refs/curate-release/run.XXXXXX` is local and never pushed. It keeps the original head reachable after the force-push, so it is created before the first destructive command, not after, and it is per run: a second run in the same clone gets its own. A shared name that every run overwrites — a `_precurate` tag, a "current run" pointer — would let one run's re-entry or recovery land in another run's worktree. `git reset --hard "$ORIG"` restores the PR head **in the worktree**, which holds nothing but the PR's files — that is why the rewrite never runs in the clone's own working tree. There, a soft reset to `BASE` re-adds to the index every path the PR deleted, so an untracked local file at such a path looks like a modification, gets staged with the path, and is erased by the hard reset. Ignored files at paths the PR branch tracks would be overwritten by a checkout. The worktree has neither.

Four things about this block are load-bearing:

- **It runs before any analysis, not here.** A session normally starts on a fresh clone of the default branch. Analysis performed anywhere but the worktree inspects the base branch instead of the PR — an empty diff and a clean idempotency check rather than an error. Nothing about that failure is visible in the output.
- **`BASE` is pinned once and never recomputed.** The files under `.git/curate-release/` make the pinned SHAs available to later Bash invocations; recover them with `cat`. They are not `git config` entries because a sandboxed harness protects `.git/config`. Recomputing the merge-base in a later phase lets a push to the base branch mid-run separate the commit the branch was analyzed against from the commit it is rewritten onto.
- **The base is never advanced.** Do not merge or rebase onto a newer `<base_ref>`: that is a content change disguised as a history change, it can produce conflicts no unattended session should resolve, and it breaks the Phase 5 tree-equality check.
- **The worktree is removed at the end.** After Phase 7, or at any stop once it exists: `git --git-dir="$(git rev-parse --path-format=absolute --git-common-dir)" worktree remove --force "$RUN/worktree"`. This works from inside the worktree. If it fails, report it and leave the directory. Keep the safety ref.

## Unstage everything

```bash
RUN='<run_dir>'                                       # the literal path setup printed; never looked up
test "$(cat "$RUN/target")" = "<owner>/<repo>#<pr_number> <head_sha>" || exit 1
cd "$RUN/worktree" || exit 1
test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || exit 1
test "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" || exit 1
BASE=$(cat "$RUN/base") && ORIG=$(cat "$RUN/orig") || exit 1
test "$(git rev-parse --verify "refs/curate-release/${RUN##*/}")" = "$ORIG" || exit 1
git reset --soft "$BASE"
git restore --staged .
```

`reset --soft` moves the worktree's detached `HEAD` back to the merge-base while leaving every file on disk untouched — the worktree is identical to `$ORIG` throughout. It also leaves the entire diff staged, which is why `restore --staged .` follows: the commits are built by staging paths deliberately, one planned commit at a time.

## Build each planned commit

Each message is written to a numbered file in this run's directory inside the repository's git directory, so it is private to this clone, outside both working trees, and still there for the Phase 5 comparison. The run directory is fresh, so the messages directory starts empty:

```bash
RUN='<run_dir>'                                       # the literal path setup printed; never looked up
test "$(cat "$RUN/target")" = "<owner>/<repo>#<pr_number> <head_sha>" || exit 1
cd "$RUN/worktree" || exit 1
test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || exit 1
test "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" || exit 1
BASE=$(cat "$RUN/base") && ORIG=$(cat "$RUN/orig") || exit 1
test "$(git rev-parse --verify "refs/curate-release/${RUN##*/}")" = "$ORIG" || exit 1
mkdir -p -- "$RUN/messages" || exit 1
```

For each commit in the printed plan, in order, with `NN` as its two-digit position (`01`, `02`, …):

```bash
(
RUN='<run_dir>'                                       # the literal path setup printed; never looked up
test "$(cat "$RUN/target")" = "<owner>/<repo>#<pr_number> <head_sha>" || exit 1
cd "$RUN/worktree" || exit 1
test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || exit 1
test "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" || exit 1
BASE=$(cat "$RUN/base") && ORIG=$(cat "$RUN/orig") || exit 1
test "$(git rev-parse --verify "refs/curate-release/${RUN##*/}")" = "$ORIG" || exit 1
message_file="$RUN/messages/NN.msg"

cat > "$message_file" <<'EOF'
<type>(<scope>): <subject>

<body>

Closes #<issue>
Co-authored-by: <preserved from original commits>
Release-Story: curated
EOF

git add --force -- <paths for this commit>
git commit -F "$message_file"
)
```

Notes:

- Use a quoted heredoc delimiter (`<<'EOF'`) so backticks, `$`, and `!` in the message are not expanded by the shell. The message files live under the git directory rather than a predictable path in `/tmp`, and they are the plan of record that Phase 5 compares against.
- Stage whole paths. Never use `git add -p`, which is interactive.
- `--force` is required, not optional: a path the PR tracks may still match `.gitignore` (a force-added file), and plain `git add` refuses it, leaving the commit short and the tree check failing. It is safe because only paths from the PR's own diff are ever named, and the worktree holds nothing else.
- The last planned commit must be the one carrying `Release-Story: curated` on HEAD — every commit gets the trailer, and HEAD's is what the Phase 1 idempotency guard reads on the next run.

Stage only paths that `git diff --name-only "$BASE" "$ORIG"` lists, one file at a time — never a directory, `.`, `-A`, or `-u`. A directory path stages whatever else happens to sit under it; naming each path keeps every commit to the plan.

After the final commit, nothing may remain unstaged. If `git status --porcelain --untracked-files=all` in the worktree is non-empty, or `git diff --quiet "$ORIG" HEAD` fails because a new file was never added, the plan did not cover every path in the diff — that is a planning defect, not something to sweep into a trailing commit. Add the missing paths to the commit they belong to by running `git reset --hard "$ORIG"` in the worktree and rebuilding.

## Verification

Run them in this order; the first is the one that matters most.

```bash
RUN='<run_dir>'                                       # the literal path setup printed; never looked up
test "$(cat "$RUN/target")" = "<owner>/<repo>#<pr_number> <head_sha>" || exit 1
cd "$RUN/worktree" || exit 1
test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || exit 1
test "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" || exit 1
BASE=$(cat "$RUN/base") && ORIG=$(cat "$RUN/orig") || exit 1
test "$(git rev-parse --verify "refs/curate-release/${RUN##*/}")" = "$ORIG" || exit 1
git diff --quiet "$ORIG" HEAD                              # trees identical — MUST exit 0
test -z "$(git status --porcelain --untracked-files=all)"  # worktree empty — MUST exit 0
test "$(git merge-base refs/remotes/origin/<base_ref> HEAD)" = "$BASE"  # base unchanged — MUST exit 0
```

Then the full-message check, which MUST exit 0:

```bash
(
RUN='<run_dir>'                                       # the literal path setup printed; never looked up
test "$(cat "$RUN/target")" = "<owner>/<repo>#<pr_number> <head_sha>" || exit 1
cd "$RUN/worktree" || exit 1
test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || exit 1
test "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" || exit 1
BASE=$(cat "$RUN/base") && ORIG=$(cat "$RUN/orig") || exit 1
test "$(git rev-parse --verify "refs/curate-release/${RUN##*/}")" = "$ORIG" || exit 1
MSG_DIR="$RUN/messages"
planned=$(find "$MSG_DIR" -name '*.msg' | wc -l)
test "$(git rev-list --count "$BASE"..HEAD)" -eq "$planned" || { echo "commit count differs from plan"; exit 1; }
n=0
for commit in $(git rev-list --reverse "$BASE"..HEAD); do
  n=$((n + 1))
  file=$(printf '%s/%02d.msg' "$MSG_DIR" "$n")
  diff -u <(git stripspace < "$file") <(git log -1 --format=%B "$commit" | git stripspace) ||
    { echo "message of $commit differs from $file"; exit 1; }
done
)
```

`git diff --quiet "$ORIG" HEAD` compares the resulting trees, not the commits. Exit 0 proves the rewrite moved commit boundaries without changing a single byte of content. This is the check that catches an accidental edit, a stray formatter run, or a missed file.

The full-message check compares each commit's whole message — subject, body, `BREAKING CHANGE:` footer, `Closes #N`, `Co-authored-by:`, and `Release-Story: curated` — against the file it was committed from, in plan order. `git stripspace` applies the same whitespace cleanup `git commit -F` does, so only a real difference fails. Reading `git log --format=%s` is not a substitute: it exits 0 whatever it prints, and a subject that matches the plan says nothing about whether the footer the analyzer reads made it into the commit.

If the repository has commitlint configured, lint the new range before pushing:

```bash
npx commitlint --from "$BASE" --to HEAD
```

Prefer the copy already in the repository's `node_modules`. An unattended routine on a restricted network cannot always reach the registry, and a commitlint that could not run is a line in the Phase 7 report — never a step quietly treated as passed.

Fix violations by rebuilding the commits, not by amending in place — a subject that violates `header-max-length` usually means the plan's subject was too long, and the plan is the record.

## Failure recovery

| Failure | Recovery |
| --- | --- |
| `git diff --quiet "$ORIG" HEAD` exits non-zero | `git reset --hard "$ORIG"`. Push nothing. Report that content was altered. |
| `git status --porcelain --untracked-files=all` in the worktree is non-empty | `git reset --hard "$ORIG"`. Rebuild with a plan that covers every path. |
| Commit count or any full message does not match the plan | `git reset --hard "$ORIG"`. Rebuild once. |
| A message still differs after the rebuild | Something rewrites messages on commit — usually a `commit-msg` or `prepare-commit-msg` hook, or `commit.cleanup` configuration. `git reset --hard "$ORIG"`. Push nothing, and report which message lost what. Never bypass it with `--no-verify`: the hook is the repository's policy, and an unattended run does not get to overrule it. |
| commitlint fails | `git reset --hard "$ORIG"`. Revise the plan's subjects and bodies, then rebuild. |
| `--force-with-lease` is rejected | Someone pushed during this run. `git reset --hard "$ORIG"`. Push nothing. Report. Do **not** retry with `--force`. |

Every row ends the same way: the remote is exactly as it was, and the operator gets a report instead of a surprise. Every reset in this table runs in the worktree, never in the clone's own working tree; remove the worktree before stopping.

## Push

```bash
git push --force-with-lease="refs/heads/<head_ref>:$ORIG" --force-if-includes origin "HEAD:refs/heads/<head_ref>"
```

Run it after the prefix, so it pushes the worktree's `HEAD`. The explicit `refs/heads/<head_ref>:$ORIG` lease is the guard that carries the weight: the push is rejected unless the remote branch still points at the commit this run started from. `--force-if-includes` is belt-and-braces here and is only independently meaningful when the lease is given without an expected value; including it costs nothing.

Never substitute `--force`. A rejected lease means the branch moved underneath this session, and `--force` would destroy whatever was pushed in the meantime.

Push only to `<head_ref>`. Do not merge the PR, approve it, close it, or change its labels — the operator gated this run on a label, and touching labels can retrigger the routine.

## What the force-push costs

Say this in the Phase 7 report every time, because the PR author will notice:

- Existing approvals are dismissed if the repository has "dismiss stale reviews" enabled.
- Line-level review comments detach from their diff positions and become harder to follow.
- Anyone with the old branch checked out needs `git fetch && git reset --hard origin/<head_ref>`.

None of these is a reason to skip curation on a PR that is about to merge, but all three are reasons to run it once, at the gate, rather than repeatedly.
