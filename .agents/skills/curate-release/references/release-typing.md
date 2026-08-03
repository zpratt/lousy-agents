# Release Typing

Phase 3 is the judgment step. Everything else in this skill is mechanical; this is where a wrong call silently costs a release.

## What is release-bearing by default

Under the default Angular convention that semantic-release ships with:

| Type | Effect | Appears in changelog |
| --- | --- | --- |
| `feat` | Minor bump | Yes — "Features" |
| `fix` | Patch bump | Yes — "Bug Fixes" |
| Any type + `BREAKING CHANGE:` footer | Major bump | Yes — "BREAKING CHANGES" |
| `perf` | **No release** by default | Preset-dependent |
| `chore`, `refactor`, `docs`, `test`, `build`, `ci`, `style` | No release | No |

If no commit since the last tag carries a recognized type, semantic-release publishes **nothing**. This is the failure mode that matters most: a mistyped `chore` does not merely omit a line from the changelog, it can withhold the entire version from customers who are waiting on it.

`perf` is the common trap. It reads like a release-bearing type and is not one under the default preset. Never plan a release-bearing `perf` commit unless the release-configuration investigation confirmed it appears in the preset or in `releaseRules`.

## The repository's config always wins

Read the config before typing anything. A repo may:

- Use `conventionalcommits` instead of `angular`, which changes section headings and which types are shown.
- Define `releaseRules` that promote types the default ignores, for example `{ "type": "perf", "release": "patch" }` or `{ "scope": "no-release", "release": false }`.
- Define `parserOpts` that change how breaking changes are detected — most importantly `noteKeywords`, which can accept `BREAKING-CHANGE` or a custom keyword.
- Enforce a `type-enum` and `scope-enum` through commitlint. A type that is valid for semantic-release but absent from the commitlint enum fails CI after the push.
- Enforce `header-max-length` (commonly 72 or 100). Subjects that exceed it fail commitlint, and the failure lands after the force-push has already dismissed approvals.

When the config and this document disagree, the config is correct.

## Branches and channels

The `branches` array determines what a given type produces on a given branch. Reporting "minor" when the branch publishes a prerelease is wrong and misleads the operator.

- **Release branch** (`main`, `master`): `feat` produces a minor on the default channel.
- **Pre-release branch** (`{ "name": "beta", "prerelease": true }`): `feat` produces a prerelease version on that branch's channel — `1.3.0-beta.1`, not `1.3.0`. Report the channel by name.
- **Maintenance branch** (`1.x`, `1.2.x`): only patches flow cleanly. A `feat` or breaking change here conflicts with the release line and typically fails the release run.
- **Branch absent from `branches`**: merging publishes nothing at all.

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
