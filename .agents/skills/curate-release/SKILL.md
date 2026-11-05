---
name: curate-release
description: "Rewrites the commits on a pull request's head branch so the changelog and release notes semantic-release generates read as a coherent story. Use when asked to 'curate release', 'curate commit history', 'rewrite commits before merge', 'rebase this branch into clean commits', 'fix commit messages for release notes', 'clean up the commits on this branch', or when an unattended routine must reshape a PR's commits into Conventional Commits. Not for changing file contents, squashing at merge time, or writing one commit message by hand."
argument-hint: "PR number or URL to curate; omit inside a routine that supplies the PR event"
effort: high
allowed-tools: Read, Grep, Glob, Bash, mcp__github
---

# Curate Release

Curate the commit history of one pull request so that the release notes semantic-release generates from it read as a coherent story for the people who consume the published package. The commits are the changelog. A real fix typed `chore` is not merely unmentioned — it can leave the entire release unpublished.

This is a history rewrite only. File contents never change: the tree at HEAD when you finish must be byte-identical to the tree you started from.

## When to Use

- A PR is ready to merge and its commits are `wip`, `fix typo`, `address review`, or otherwise meaningless to a customer reading a changelog.
- A repository publishes with semantic-release (or any Conventional Commits analyzer) and merges with a merge or rebase strategy, so individual commits survive into the release.
- An unattended routine fires on a gate label and must reshape the branch without a human present.

Do not use this skill to:

- Change what the code does. Use a normal edit-and-commit flow.
- Write a single commit message for work in progress. Write it directly.
- Curate history for a squash-only repository. Individual commits are discarded at merge; Phase 1 handles this case by proposing a squash title instead.
- Rebase onto a newer base, resolve conflicts, or merge the PR.

## Requirements

This skill reads and writes GitHub state as well as git. Confirm all of these before Phase 0, and stop with the specific missing capability if any is absent:

- **git 2.31 or newer.** Phase 1 uses `rev-parse --path-format`, and Phase 6 uses `--force-if-includes`; older versions reject them.
- **Push access to the PR's head branch.** In a hosted routine this usually means unrestricted branch pushes must be enabled; see `./references/routine-setup.md`.
- **GitHub read access** to the PR's state, draft flag, head repository, and the repository's `allow_merge_commit` / `allow_rebase_merge` / `allow_squash_merge` settings. Use `gh` when it is installed, otherwise the harness's built-in GitHub tools — `gh` is not pre-installed in most hosted sessions, so do not assume it. Phase 1 cannot be evaluated without these, and a repository whose merge settings cannot be read is a stop, not a default-to-rewrite.
- **GitHub write access** for exactly one PR comment — the Phase 7 report, or the squash-only proposal that replaces the whole run in Phase 1. No other GitHub write is authorized: not a label, not a review, not an edit to the PR title or body.

## Operating Mode

Assume you run unattended and there is no human to ask. If a precondition fails, stop and report — never improvise, and never guess a value you could not resolve. Every abort path leaves the remote untouched.

## Phase 0 — Resolve the Target

No work happens before this succeeds.

1. If the invocation supplied a PR number or URL, use it and read that PR's metadata. Otherwise read the triggering GitHub event context in this session. Either way, extract `owner`, `repo`, `pr_number`, `head_ref`, `head_sha`, `base_ref`, and `head_repo`.
2. If any value cannot be determined, list open PRs with the GitHub tools and match on head SHA. If it is still ambiguous, **STOP** and report "could not resolve the target PR". Never guess a PR number.
3. Print the resolved values before continuing.

## Phase 1 — Preflight Gates

### Gates that need only PR metadata

Evaluate these before running a single git command. The first two abort the run outright, with a short report and no writes:

- The PR is closed, merged, or a draft.
- `head_repo` differs from the base repo. A fork PR cannot be pushed to from this session.

The third cancels the rewrite but not the run:

- The repository's only enabled merge strategy is squash. Check `allow_merge_commit`, `allow_rebase_merge`, and `allow_squash_merge` through the GitHub API. Curated commits would be discarded at merge time, so there is nothing to rewrite — but the analysis still has a useful product. Continue through the worktree setup and Phases 2–3, post a proposed Conventional Commit squash title and body, and **STOP** before Phase 4. Never push, and never edit the PR title or body yourself.

### Gates that need the local clone

Only once the two aborting gates above pass. The rewrite itself happens in a dedicated worktree (below), so nothing in the clone's own working tree, index, or branches is ever reset. These gates still refuse to start when the clone holds work the owner has not published, and they bind the push destination:

- **Tracked files have uncommitted changes.** `git status --porcelain --untracked-files=no` must print nothing. Someone is mid-edit in this clone; rewriting the remote branch under them is their decision, not this run's. Never stash, commit, or discard their changes to make the gate pass. Report the paths and stop. Untracked and ignored files do not fail this gate — a sandboxed harness places stub files such as `.bashrc` and `.claude/` in every workspace — and the isolated worktree never touches them.
- **`origin` is not the PR's repository, or not only it.** `git remote get-url --all origin` and `git remote get-url --push --all origin` must each print **exactly one** URL, and both must name `<owner>/<repo>`: strip a trailing `/` and `.git`, then compare the last two path segments case-insensitively (this accepts `https://github.com/<owner>/<repo>.git`, `git@github.com:<owner>/<repo>`, and proxy URLs ending in `/<owner>/<repo>`). Without `--all`, `get-url` shows only the first URL, while `git push origin` pushes to every configured push URL — a second one would receive the rewrite too, and the lease would pass there if it holds the same commit. The force-with-lease in Phase 6 guards against a concurrent push, not against a wrong destination; a PR URL from another repository whose branch name happens to exist here would otherwise be rewritten into this one.

Then fetch, and check the two gates the fetch makes possible:

```bash
git fetch --tags origin "+refs/heads/<base_ref>:refs/remotes/origin/<base_ref>" \
  "+refs/heads/<head_ref>:refs/remotes/origin/<head_ref>"
test "$(git rev-parse refs/remotes/origin/<head_ref>)" = "<head_sha>"     # remote head is the PR head — MUST exit 0
! git show-ref --verify --quiet refs/heads/<head_ref> ||
  git merge-base --is-ancestor refs/heads/<head_ref> refs/remotes/origin/<head_ref>  # nothing unpublished — MUST exit 0
```

Spell refs out in full, here and in every later command: a tag named like the branch would otherwise win the lookup — `<head_ref>` alone resolves to `refs/tags/<head_ref>` when both exist, which lets a local branch with unpublished commits pass the ancestry check.

- **The fetched head is not `head_sha`.** Either `origin` is a different repository after all, or the branch moved between reading the PR and fetching it. Stop either way; do not re-resolve and continue.
- **A local `<head_ref>` holds commits `origin/<head_ref>` does not.** The force-push would leave that work stranded on a branch whose remote no longer shares its history. Report the branch and stop.

### Establish the git state

Once every gate above passes — a squash-only repository continues through here as well, since its proposal needs the same analysis. Create a detached worktree at the PR head inside the repository's git directory and do **all** later work there. These commands are local-only and write nothing to the remote:

```bash
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

Setup prints `RUN=<path>`. That path is this run's identity: write it literally in place of `<run_dir>` in every later block, starting with this prefix, which re-enters the worktree and reloads the pinned values:

```bash
RUN='<run_dir>'                                       # the literal path setup printed; never looked up
test "$(cat "$RUN/target")" = "<owner>/<repo>#<pr_number> <head_sha>" || exit 1
cd "$RUN/worktree" || exit 1
test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || exit 1
test "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" || exit 1
BASE=$(cat "$RUN/base") && ORIG=$(cat "$RUN/orig") || exit 1
test "$(git rev-parse --verify "refs/curate-release/${RUN##*/}")" = "$ORIG" || exit 1
```

**Every line in both blocks ends in `|| exit 1`, and a non-zero exit from either is a stop.** Do not drop the guards, and do not run the lines one at a time without them. A failed `worktree add` or `cd` otherwise leaves the shell in the clone's own checkout, where the HEAD check still passes if the clone happens to sit at the PR head, and every reset after it would run there. The `--show-toplevel` and linked-worktree checks prove where the shell is; the HEAD check alone does not. Never clear a leftover worktree with `rm -rf`: a locked or still-registered one survives it. The fresh `mktemp -d` directory avoids collisions instead.

Nothing in these blocks is shared between runs. Another run in the same clone — a second PR, or a refired label event — gets its own directory, worktree, pins, and safety ref `refs/curate-release/run.XXXXXX`. Never find the run by looking it up (a "latest run" pointer, a directory listing, a shared tag): another run's setup would redirect this one into its worktree, where every location check still passes. The `target` check proves the directory belongs to this PR at this head, and the safety-ref check proves its pins were not swapped. Recovery uses this run's pinned `ORIG`, never a name another run could move.

Why a separate worktree: every recovery path in this skill ends in `git reset --hard "$ORIG"`, and a soft reset to `BASE` puts back into the index any path the PR deleted. Run in the clone's own working tree, that combination overwrote ignored files on checkout, committed a local untracked file that sat at a path the PR deleted, and then erased it on recovery. A fresh worktree holds nothing but the PR's own files, so no reset there can reach anyone's work, and the clone's checked-out branch is never moved. Never run the rewrite commands in the clone's own working tree.

Do this **before** any analysis, and never recompute `BASE` or `ORIG` afterward. The pins are files rather than `git config` entries because a sandboxed harness protects `.git/config`. Both pins matter:

- A session normally starts on a fresh clone of the default branch. Analysis run anywhere but the worktree inspects the wrong branch — computing an empty diff and reporting nothing queued rather than failing. Wrong-branch analysis is silent, which makes it worse than an abort; the guarded `cd` and the location checks prevent it.
- Pinning `BASE` once means the branch is analyzed and rewritten against the same commit. Recomputing it later lets a push to the base branch mid-run split the two apart.

When the run ends — after Phase 7, or at any stop after the worktree exists — remove it with `git --git-dir="$(git rev-parse --path-format=absolute --git-common-dir)" worktree remove --force "$RUN/worktree"`. If that fails, report it and leave the directory; do not `rm -rf` it. Keep the run's safety ref `refs/curate-release/run.XXXXXX`: it is the way back to the original branch after the force-push, and the Phase 7 report names it.

### The gate that needs the commits

- Every commit between `BASE` and HEAD already parses as a valid Conventional Commit **and** HEAD's message carries the trailer `Release-Story: curated`. Report "already curated" and **STOP**. This is the idempotency guard; label events refire.

Two conditions warn but do not abort — carry them into the Phase 7 report. Read `./references/preflight-gates.md` for the full gate table, the squash-only comment format, and the warning conditions covering unreleased and maintenance base branches.

## Phase 2 — Ground Yourself

Mandatory before any rewrite. Dispatch these four investigations in parallel — they share no state — and do not begin Phase 3 until all have reported.

Run every investigation from the worktree, starting each Bash invocation with the prefix above, and read repository files (release config, commitlint config) from the worktree too. Do not calculate a fresh merge-base.

- **Release configuration.** Read the semantic-release config from whichever exists: `.releaserc`, `.releaserc.{json,yaml,yml,js,cjs,mjs}`, `release.config.{js,cjs,mjs}`, or the `release` key in `package.json`. Report the preset, `tagFormat` (default `v${version}`), any custom `releaseRules`, `parserOpts`, and which plugins generate notes. Read any commitlint config (`commitlint.config.*`, `.commitlintrc*`, `package.json#commitlint`) and report the enforced type enum, scope enum, and header length limit. Report the `branches` array: which branches are release, maintenance, and pre-release, and which channel `<base_ref>` publishes to. Report which types trigger a release under the configured rules. **The repository's own config wins over every default in Phase 3.**
- **Release scope.** semantic-release analyzes every commit since the last release on `<base_ref>`, not just this PR. The last release is **not** the nearest tag: it is the highest-versioned tag that matches `tagFormat`, is merged into the branch, and is a release version (a prerelease counts only on a pre-release branch, for that branch's channel). `git describe --tags` picks whatever tag is nearest — a deploy marker or another package's tag — and silently drops queued commits from the range. Resolve `LAST_TAG` with the procedure in `./references/release-typing.md` and the tags the Phase 1 fetch brought down. If none is found, do **not** abort: a repository before its first release has no release tags, and so does a clone fetched without them. Report that no release has been published yet and treat every commit on `origin/<base_ref>` as queued. Read the queued commits with their **full messages** — `git log "refs/tags/$LAST_TAG"..refs/remotes/origin/<base_ref> --format='%H%n%B%x1e'`, or `git log refs/remotes/origin/<base_ref> --format='%H%n%B%x1e'` with no tag — because the analyzer reads the whole message: a `BREAKING CHANGE:` footer, a revert, or a body-only keyword never appears in a subject. Report what is already queued and the largest bump it claims: these commits are one chapter of that changelog, not the whole of it.
- **The change.** Produce `git diff "$BASE"...HEAD` — the `BASE` pinned in Phase 1, not a freshly computed merge-base — and summarize it by concern: what capability was added, what defect was fixed, what is internal-only. Flag any user-visible behavior change, config change, or API signature change as a breaking-change candidate.
- **Intent.** Read the PR title, body, and review comments. Follow every issue reference (`#123`, `Closes #`, `Fixes #`, full URLs) and read those issues and their comments. Report the customer-facing problem each one names.

Synthesize one paragraph stating what a consumer of this package gains from this PR. If the diff and the stated intent disagree materially, say so in the final report — do not paper over it.

## Phase 3 — Design the Commit Narrative

The release notes **are** the story. Type each commit according to customer impact, not according to which files moved. Under the default rules of `@semantic-release/commit-analyzer`, `feat`, `fix`, `perf`, a revert, and a `BREAKING CHANGE` footer are release-bearing; if no commit since the last release carries one, nothing publishes at all. Anything typed `chore`, `refactor`, `docs`, `test`, `build`, `ci`, or `style` is invisible to customers.

When a change is genuinely user-visible, `fix` or `feat` is the correct type even if the diff is small. When in doubt, use `fix`.

Plan an ordered list of commits, each with this shape:

```
<type>(<scope>): <subject>

<body — what changed and why it matters to a consumer>

<footers>
```

Rules for each commit:

- `feat` → minor; `fix`, `perf`, and a revert → patch; everything else → no release. Custom `releaseRules` are checked first and win where they match — including `release: false` — so the release-configuration investigation decides any type it covers. `perf` is for a speedup a consumer can observe; an internal-only speedup is `refactor`.
- Signal breaking changes with a `BREAKING CHANGE: <description>` footer. The footer is what the analyzer reads and it is **mandatory**. The `!` marker after the type or scope is a readability convention only — never use it as the sole signal.
- Reference issues in footers: `Closes #123` or `Refs #123`.
- Add `Release-Story: curated` as a trailer on every commit you author.
- Preserve any existing `Co-authored-by:` trailers from the original commits.

Rules for the plan as a whole:

- Group by **path**, not by hunk. If one file legitimately belongs to two commits, keep it whole in the more important commit rather than splitting hunks.
- Prefer 2–6 commits. One commit is correct when the PR does exactly one thing.
- Order foundation first, then the feature, then follow-ups. A reader scanning the changelog top to bottom should understand the arc without opening the diff.
- Never invent work that is not in the diff to pad the story.

Print the full plan — every subject and body — before executing it. `./references/release-typing.md` covers pre-release and maintenance channels, custom `releaseRules`, and the typing decisions that most often suppress a release.

## Phase 4 — Execute the Rewrite

There is no editor in this environment. Do **not** run `git rebase -i`.

`BASE`, `ORIG`, and the run's safety ref were established in Phase 1 and are reused as-is. Everything in this phase runs in the worktree:

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
# then, per planned commit:
#   git add --force -- <paths from the diff>
#   git commit -F <message-file>
```

- Do **not** merge or rebase onto the latest `<base_ref>`. `BASE` stays exactly where it was; changing it risks conflicts you cannot resolve unattended.
- Never touch any commit at or before `BASE`.
- Never modify file contents.

## Phase 5 — Verify

Three assertions, run in the worktree after the prefix. All must exit 0 before pushing:

```bash
git diff --quiet "$ORIG" HEAD                                         # trees identical
test -z "$(git status --porcelain --untracked-files=all)"             # worktree empty — nothing left over
test "$(git merge-base refs/remotes/origin/<base_ref> HEAD)" = "$BASE"  # base unchanged
```

and the full-message check from `./references/rewrite-runbook.md`, which compares every rewritten commit's whole message — subject, body, and every footer and trailer — against the message file Phase 4 committed it from, in order. Comparing subjects is not enough: the footers are what the analyzer reads, and a commit that lost its `BREAKING CHANGE:` footer or its `Closes #N` has a perfectly correct subject.

If `git diff --quiet "$ORIG" HEAD` fails, you have altered content. Run `git reset --hard "$ORIG"`, push nothing, and report the failure.

If the repository has a commitlint setup, run it against the new range and fix every violation before pushing. Prefer the copy in the repository's own `node_modules`; a routine on a restricted network may not be able to fetch it with `npx`, and an unrunnable linter is something to report in Phase 7, never to skip silently. `./references/rewrite-runbook.md` gives the full command sequence with the recovery path for each failure.

## Phase 6 — Push

```bash
git push --force-with-lease="refs/heads/<head_ref>:$ORIG" --force-if-includes origin "HEAD:refs/heads/<head_ref>"
```

Run it after the prefix, so `HEAD` is the rewritten history in the worktree. The explicit lease value is the load-bearing guard: the push fails if the remote branch no longer points at the commit you started from. It says nothing about *which* repository it is pushing to — that is why Phase 1 bound `origin` to `<owner>/<repo>` and `ORIG` to `head_sha`. Do not change the remote or its URL after those gates.

- If the lease fails, someone pushed during this run. Do **not** retry with `--force`. Run `git reset --hard "$ORIG"` in the worktree, push nothing, and report.
- Push only to `<head_ref>`. Never push to `<base_ref>` or any other branch.
- Do not merge the PR, approve it, or change its labels.

## Phase 7 — Report

Post one PR comment, under 300 words, containing:

1. Old commit subjects mapped to new commit subjects.
2. The release type semantic-release will now produce (major, minor, patch, prerelease, or none), which commit drives it, and the publish channel for `<base_ref>`. If a sibling commit since the last release already claims an equal or larger bump, say that this PR does not change the version.
3. A preview of only the changelog entries **this PR contributes**. The next release also includes everything else merged since the last tag — do not present this as the full release notes.
4. Any intent-versus-diff discrepancy, and any breaking change you detected.
5. A reminder that the force-push dismissed existing approvals and detached line-level review comments.
6. The local safety ref (`refs/curate-release/run.XXXXXX`) that still points at the original head, for anyone who needs the old history back.

## Hard Constraints

Violating any of these is a failed run:

- Push only to the PR's head branch, with `--force-with-lease`, never `--force`.
- Every commit message must be valid Conventional Commits per the repository's own config.
- Never alter file contents. The tree at HEAD must be byte-identical to the tree you started from.
- Never rewrite history at or before the merge-base.
- Never start the rewrite with uncommitted tracked changes, over a local branch with unpublished commits, or against an `origin` that is not exactly one fetch and one push URL for the PR's repository at the PR's head SHA.
- Never run a reset, checkout, or commit of this skill in the clone's own working tree — only in the Phase 1 worktree.
- Never merge, close, or re-label the PR.
- On any failed verification, run `git reset --hard "$ORIG"` in this run's worktree and push nothing.
- Re-enter a run only by the path its own setup printed — never through a shared pointer or tag that another run could move.

## References

| File | Read it when |
| --- | --- |
| `./references/preflight-gates.md` | Running Phase 1, or a gate is ambiguous — includes the squash-only comment format |
| `./references/release-typing.md` | Choosing commit types in Phase 3, or the repo uses custom `releaseRules`, pre-release, or maintenance branches |
| `./references/rewrite-runbook.md` | Executing Phases 4–6, or a verification check failed and you need the recovery path |
| `./references/routine-setup.md` | Wiring this skill into an unattended label-triggered routine |
