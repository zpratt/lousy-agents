# Release Typing

Phase 3 is the judgment step. Everything else in this skill is mechanical; this is where a wrong call silently costs a release.

## What is release-bearing by default

Under the default release rules of `@semantic-release/commit-analyzer` with the Angular preset:

| Type | Effect | Appears in changelog |
| --- | --- | --- |
| `feat` | Minor bump | Yes — "Features" |
| `fix` | Patch bump | Yes — "Bug Fixes" |
| `perf` | Patch bump | Yes — "Performance Improvements" |
| A revert (`revert: <header>` with `This reverts commit <sha>.`) | Patch bump | Yes — "Reverts" |
| Any type + `BREAKING CHANGE:` footer | Major bump | Yes — "BREAKING CHANGES" |
| `chore`, `refactor`, `docs`, `test`, `build`, `ci`, `style` | No release | No |

If no commit since the last release carries a release-bearing type, semantic-release publishes **nothing**. This is the failure mode that matters most: a mistyped `chore` does not merely omit a line from the changelog, it can withhold the entire version from customers who are waiting on it.

`perf` cuts both ways. It is release-bearing by default, so a consumer-visible speedup typed `perf` publishes a patch, and an internal-only speedup typed `perf` publishes a patch nobody needed. Use `perf` when someone upgrading the package would notice; use `refactor` when they would not. A repository can still turn it off with a `{ "type": "perf", "release": false }` rule — the configuration decides.

## The repository's config always wins

Read the config before typing anything. A repo may:

- Use `conventionalcommits` instead of `angular`, which changes section headings and which types are shown.
- Define `releaseRules` that promote types the default ignores or suppress types it releases, for example `{ "type": "docs", "scope": "readme", "release": "patch" }` or `{ "scope": "no-release", "release": false }`. Custom rules are evaluated first; the default rules apply only to a commit no custom rule matched, and a matching `release: false` stops there.
- Set `tagFormat` (default `v${version}`), which decides which tags count as releases — see below.
- Define `parserOpts` that change how breaking changes are detected — most importantly `noteKeywords`, which can accept `BREAKING-CHANGE` or a custom keyword.
- Enforce a `type-enum` and `scope-enum` through commitlint. A type that is valid for semantic-release but absent from the commitlint enum fails CI after the push.
- Enforce `header-max-length` (commonly 72 or 100). Subjects that exceed it fail commitlint, and the failure lands after the force-push has already dismissed approvals.

When the config and this document disagree, the config is correct.

## Branches and channels

The `branches` array determines what a given type produces on a given branch. Reporting "minor" when the branch publishes a prerelease is wrong and misleads the operator.

- **Release branch** (`main`, `master`): `feat` produces a minor on the default channel.
- **Pre-release branch** (`{ "name": "beta", "prerelease": true }`): `feat` produces a prerelease version on that branch's channel — `1.3.0-beta.1`, not `1.3.0`. Report the channel by name.
- **Maintenance branch** (`1.x`, `1.2.x`, or any branch with a `range`): publishes only inside a range bounded by existing releases. Whether a `feat` fits depends on that range, not on the branch being a maintenance line — compute it as below.
- **Release branches other than the last** (`main` when `next` follows it): bounded the same way, by the first version `next` released that `main` has not.
- **Branch absent from `branches`**: merging publishes nothing at all.

### Which bumps a bounded branch accepts

semantic-release computes, for a maintenance branch:

- **min** — the higher of the branch's latest release and the lower bound of its range (`1.x` → `1.0.0`, `1.2.x` → `1.2.0`).
- **max** — the lower of the upper bound of its range (`1.x` → `2.0.0`, `1.2.x` → `1.3.0`) and a **ceiling** from the main release branch (the first entry in `branches` that is not a maintenance or pre-release branch):
  1. the lowest release on it that is higher than every release on every maintenance branch;
  2. if there is none, its latest release;
  3. if it has no releases at all, `1.0.0`.

  Do not skip to the range's upper bound when step 1 finds nothing. A maintenance branch cut at `main`'s latest release has min = max, and accepts nothing until `main` releases again.
- **accepted bumps** — every release type smaller than the difference between min and max. A major difference accepts patch and minor; a minor difference accepts patch only; no difference accepts nothing.

Worked examples, with `main` already at `2.1.0`:

| Base branch | Latest release on it | min → max | Accepts |
| --- | --- | --- | --- |
| `1.x` (lowest `main` release above every maintenance release: `2.0.0`) | `1.4.2` | `1.4.2` → `2.0.0` | patch, minor |
| `1.4.x` | `1.4.2` | `1.4.2` → `1.5.0` | patch |
| `1.x`, but `main` released `1.5.0` before `1.x` was cut from `1.4.2` | `1.4.2` | `1.4.2` → `1.5.0` | patch |
| `1.x`, cut from `main` at `1.4.2`, and `main` has released nothing since | `1.4.2` | `1.4.2` → `1.4.2` (ceiling falls back to `main`'s latest) | nothing — any release fails |

The release type is the largest bump among **all** commits since the last release on the branch, so compare that combined bump — not this PR's alone — against the accepted set. Read the release tags with `git tag --merged refs/remotes/origin/<branch>` for each branch involved; do not infer them from the branch name.

## Finding the last release

semantic-release does not use the nearest tag. For `<base_ref>` it takes every tag merged into the branch, keeps those that match `tagFormat` with a valid semantic version in the `${version}` slot, drops prerelease versions (on a pre-release branch it keeps the ones whose prerelease identifier is that branch's and whose channel note names that branch's channel), and picks the **highest version**. A deploy marker, a CI tag, or another package's tag in a monorepo is never the last release, however close it sits to HEAD.

For a release or maintenance branch:

```bash
TAG_FORMAT='v${version}'   # the config's tagFormat, if it sets one
prefix=${TAG_FORMAT%%'${version}'*}
suffix=${TAG_FORMAT#*'${version}'}
LAST_TAG=$(git -c versionsort.suffix=- tag --merged refs/remotes/origin/<base_ref> --sort=-v:refname |
  while IFS= read -r tag; do
    case $tag in "$prefix"*"$suffix") ;; *) continue ;; esac
    version=${tag#"$prefix"}; version=${version%"$suffix"}
    printf '%s\n' "$version" |
      grep -Eqx '(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(\+[0-9A-Za-z.-]+)?' || continue
    printf '%s\n' "$tag"; break
  done)
```

The single quotes around `TAG_FORMAT` matter: `${version}` is semantic-release's placeholder, not a shell variable. The regex admits only release versions, so prerelease tags are skipped; `versionsort.suffix=-` keeps the sort semver-correct.

For a pre-release branch, prerelease tags count only when their channel note says so. Fetch the notes with `git fetch origin 'refs/notes/semantic-release*:refs/notes/semantic-release*'` and read them with `git log --tags='*' --decorate-refs='refs/tags/*' --no-walk --format='%d%x09%N' --notes='refs/notes/semantic-release*'`. If the notes cannot be fetched, compute the range from release versions only and say in the Phase 7 report that prerelease history was not verified.

An empty `LAST_TAG` means no release has been published — not that the lookup failed. Every commit on the branch is then queued.

## Typing by customer impact

The question is never "which files moved" — it is "what changes for someone who upgrades this package".

- A one-line change to a default value that alters runtime behavior is a `fix`, not a `chore`.
- A new exported function nobody can reach yet is `feat` only if it is actually exported and documented; otherwise it is internal.
- Renaming an exported symbol, removing a config key, or changing a function signature is a breaking change and needs the footer, regardless of how small the diff is.
- Moving a file with no behavior change is `refactor` and correctly produces no release.
- A dependency bump is `fix` when it patches a vulnerability or defect the consumer is exposed to, and `chore` when it is development-only.

## Breaking changes

The `BREAKING CHANGE: <description>` footer is what the analyzer reads. It is mandatory.

The `!` marker (`feat(api)!: ...`) is a readability convention. Some parser configurations recognize it and some do not, so it must never be the only signal. Write both if you like the marker; write the footer always.

The description belongs to the consumer, not the implementer. State what breaks and what to do instead:

```
BREAKING CHANGE: `createClient` no longer accepts a bare string. Pass
`{ endpoint: "..." }` instead. Callers passing a string will throw at
construction rather than failing on the first request.
```

## Sizing the plan

Prefer 2–6 commits. The bound is not arbitrary:

- **One commit** is right when the PR does exactly one thing. Splitting it produces filler commits that dilute the changelog.
- **More than six** usually means hunks are being split or internal steps are being narrated. The changelog reader does not want the development sequence, they want the arc of the change.

Group by path. If a file legitimately belongs to two commits, keep it whole in the more important one. A commit that does not build on its own is worse than a commit that carries one extra file — and splitting hunks across commits routinely produces exactly that.
