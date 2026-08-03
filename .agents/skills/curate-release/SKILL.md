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

- **git 2.30 or newer.** Phase 6 uses `--force-if-includes`, which older versions reject.
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

- The repository's only enabled merge strategy is squash. Check `allow_merge_commit`, `allow_rebase_merge`, and `allow_squash_merge` through the GitHub API. Curated commits would be discarded at merge time, so there is nothing to rewrite — but the analysis still has a useful product. Continue through the checkout and Phases 2–3, post a proposed Conventional Commit squash title and body, and **STOP** before Phase 4. Never push, and never edit the PR title or body yourself.

### Establish the git state

Only once the two aborting gates above pass — a squash-only repository continues through here as well, since its proposal needs the same analysis. These commands are local-only and write nothing to the remote:

```bash
git fetch --tags origin <base_ref> <head_ref>
git checkout -B <head_ref> origin/<head_ref>
BASE=$(git merge-base origin/<base_ref> HEAD)
ORIG=$(git rev-parse HEAD)
git tag -f _precurate "$ORIG"          # local safety ref
git config --local curate-release.base "$BASE"
git config --local curate-release.orig "$ORIG"
```

Do this **before** any analysis, and never recompute `BASE` or `ORIG` afterward. The local config entries persist the pinned values across separate or parallel Bash invocations; read them with `git config --local --get curate-release.base` and `git config --local --get curate-release.orig` before a later command needs them. Both matter:

- A session normally starts on a fresh clone of the default branch. Without the checkout, `HEAD` is the base branch, so the idempotency gate below and every command in Phase 2 would inspect the wrong branch — computing an empty diff and reporting nothing queued rather than failing. Wrong-branch analysis is silent, which makes it worse than an abort.
- Pinning `BASE` once means the branch is analyzed and rewritten against the same commit. Recomputing it later lets a push to the base branch mid-run split the two apart.

### The gate that needs the commits

- Every commit between `BASE` and HEAD already parses as a valid Conventional Commit **and** HEAD's message carries the trailer `Release-Story: curated`. Report "already curated" and **STOP**. This is the idempotency guard; label events refire.

Two conditions warn but do not abort — carry them into the Phase 7 report. Read `./references/preflight-gates.md` for the full gate table, the squash-only comment format, and the warning conditions covering unreleased and maintenance base branches.

## Phase 2 — Ground Yourself

Mandatory before any rewrite. Dispatch these four investigations in parallel — they share no state — and do not begin Phase 3 until all have reported.

For any separate Bash invocation that needs the pinned merge-base, first set `BASE=$(git config --local --get curate-release.base)`. Do not calculate a fresh merge-base.

- **Release configuration.** Read the semantic-release config from whichever exists: `.releaserc`, `.releaserc.{json,yaml,yml,js,cjs,mjs}`, `release.config.{js,cjs,mjs}`, or the `release` key in `package.json`. Report the preset, any custom `releaseRules`, `parserOpts`, and which plugins generate notes. Read any commitlint config (`commitlint.config.*`, `.commitlintrc*`, `package.json#commitlint`) and report the enforced type enum, scope enum, and header length limit. Report the `branches` array: which branches are release, maintenance, and pre-release, and which channel `<base_ref>` publishes to. Report whether any type beyond `feat` and `fix` actually triggers a release under the configured preset. **The repository's own config wins over every default in Phase 3.**
- **Release scope.** semantic-release analyzes every commit since the last Git tag, not just this PR. Tags came down with the Phase 1 fetch; resolve the last one with `LAST_TAG=$(git describe --tags --abbrev=0 origin/<base_ref> 2>/dev/null)`. If a tag is found, run `git log "$LAST_TAG"..origin/<base_ref> --format='%s'`. If none is found, `git describe` exits non-zero — do **not** abort. A repository before its first release has no tags, and so does a clone fetched without them; report that no release has been published yet and treat every commit on `origin/<base_ref>` as queued (`git log origin/<base_ref> --format='%s'`). The first release is precisely when a missing `feat` or `fix` means nothing publishes at all. Report what is already queued either way: these commits are one chapter of that changelog, not the whole of it.
- **The change.** Produce `git diff "$BASE"...HEAD` — the `BASE` pinned in Phase 1, not a freshly computed merge-base — and summarize it by concern: what capability was added, what defect was fixed, what is internal-only. Flag any user-visible behavior change, config change, or API signature change as a breaking-change candidate.
- **Intent.** Read the PR title, body, and review comments. Follow every issue reference (`#123`, `Closes #`, `Fixes #`, full URLs) and read those issues and their comments. Report the customer-facing problem each one names.

Synthesize one paragraph stating what a consumer of this package gains from this PR. If the diff and the stated intent disagree materially, say so in the final report — do not paper over it.

## Phase 3 — Design the Commit Narrative

The release notes **are** the story. Type each commit according to customer impact, not according to which files moved. Under the default Angular convention only `feat`, `fix`, and a `BREAKING CHANGE` footer are release-bearing; if no commit since the last tag carries a recognized type, nothing publishes at all. Anything typed `chore`, `refactor`, `docs`, `test`, `build`, `ci`, or `style` is invisible to customers.

When a change is genuinely user-visible, `fix` or `feat` is the correct type even if the diff is small. When in doubt, use `fix`.

Plan an ordered list of commits, each with this shape:

```
<type>(<scope>): <subject>

<body — what changed and why it matters to a consumer>

<footers>
```

Rules for each commit:

- `feat` → minor, `fix` → patch, everything else → no release. Any other type, including `perf`, is release-bearing **only** if the release-configuration investigation confirmed it in the preset or `releaseRules`.
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

`BASE`, `ORIG`, and the `_precurate` tag were established in Phase 1 and are reused as-is. In a new shell, restore `BASE` and `ORIG` from the local config before proceeding:

```bash
BASE=$(git config --local --get curate-release.base)
ORIG=$(git config --local --get curate-release.orig)
git reset --soft "$BASE"
git restore --staged .
# then, per planned commit:
#   git add <paths>
#   git commit -F <message-file>
```

- Do **not** merge or rebase onto the latest `<base_ref>`. `BASE` stays exactly where it was; changing it risks conflicts you cannot resolve unattended.
- Never touch any commit at or before `BASE`.
- Never modify file contents.

## Phase 5 — Verify

Three assertions and one reading. All must be satisfied before pushing:

```bash
git diff --quiet "$ORIG" HEAD                             # trees identical — MUST exit 0
test -z "$(git status --porcelain)"                       # worktree MUST be empty
test "$(git merge-base origin/<base_ref> HEAD)" = "$BASE"  # base unchanged — MUST exit 0
git log --format=%s "$BASE"..HEAD                         # READ IT — must match the printed plan
```

The first three fail on their own. The fourth does not: `git log` exits 0 whatever it prints, so a plan mismatch passes silently unless you actually compare its output line by line against the plan you printed in Phase 3. Treat an unread `git log` as a failed verification.

If `git diff --quiet "$ORIG" HEAD` fails, you have altered content. Run `git reset --hard _precurate`, push nothing, and report the failure.

If the repository has a commitlint setup, run it against the new range and fix every violation before pushing. Prefer the copy in the repository's own `node_modules`; a routine on a restricted network may not be able to fetch it with `npx`, and an unrunnable linter is something to report in Phase 7, never to skip silently. `./references/rewrite-runbook.md` gives the full command sequence with the recovery path for each failure.

## Phase 6 — Push

```bash
git push --force-with-lease="<head_ref>:$ORIG" --force-if-includes origin HEAD:<head_ref>
```

The explicit lease value is the load-bearing guard: the push fails if the remote branch no longer points at the commit you started from.

- If the lease fails, someone pushed during this run. Do **not** retry with `--force`. Reset to `_precurate`, push nothing, and report.
- Push only to `<head_ref>`. Never push to `<base_ref>` or any other branch.
- Do not merge the PR, approve it, or change its labels.

## Phase 7 — Report

Post one PR comment, under 300 words, containing:

1. Old commit subjects mapped to new commit subjects.
2. The release type semantic-release will now produce (major, minor, patch, prerelease, or none), which commit drives it, and the publish channel for `<base_ref>`. If a sibling commit since the last tag already claims an equal or larger bump, say that this PR does not change the version.
3. A preview of only the changelog entries **this PR contributes**. The next release also includes everything else merged since the last tag — do not present this as the full release notes.
4. Any intent-versus-diff discrepancy, and any breaking change you detected.
5. A reminder that the force-push dismissed existing approvals and detached line-level review comments.

## Hard Constraints

Violating any of these is a failed run:

- Push only to the PR's head branch, with `--force-with-lease`, never `--force`.
- Every commit message must be valid Conventional Commits per the repository's own config.
- Never alter file contents. The tree at HEAD must be byte-identical to the tree you started from.
- Never rewrite history at or before the merge-base.
- Never merge, close, or re-label the PR.
- On any failed verification, restore `_precurate` and push nothing.

## References

| File | Read it when |
| --- | --- |
| `./references/preflight-gates.md` | Running Phase 1, or a gate is ambiguous — includes the squash-only comment format |
| `./references/release-typing.md` | Choosing commit types in Phase 3, or the repo uses custom `releaseRules`, pre-release, or maintenance branches |
| `./references/rewrite-runbook.md` | Executing Phases 4–6, or a verification check failed and you need the recovery path |
| `./references/routine-setup.md` | Wiring this skill into an unattended label-triggered routine |
