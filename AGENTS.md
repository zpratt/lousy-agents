# Agent Instructions

Multi-reader agent contract for this monorepo (Codex and other AGENTS.md consumers). Deep engineering rules live in `.github/copilot-instructions.md` — keep this file focused on shared tracking, shell safety, and validation.

## Mandatory

- Follow the GitHub task-tracking policy below for durable feature work.
- Use non-interactive shell flags for file operations (see Non-Interactive Shell Commands).
- Do **not** skip validation before commit when you change code, agent instructions, skills, or agent definitions.
- Do **not** use beads/`bd` or any local issue database.

## Task Tracking

Durable feature work uses **GitHub**:

1. Parent **epic** issue for the feature
2. **Sub-issues** for vertical slices
3. **PR checklist** on each issue/sub-issue for implementation steps

No local issue database. Do **not** use beads/`bd`. Session-scoped agent todos are OK for ephemeral in-session work only. If `gh` is unavailable when durable tracking is needed, stop and tell the user.

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**

```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**

- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## Commands

Mise manages tools and Node. Prefer file-scoped checks while iterating; run the full suite before commit.

```bash
mise run test                 # Unit tests (vitest)
mise run lint                 # All lint tools in parallel
mise run typecheck            # Strict tsc --noEmit across all workspace packages
npm run build                 # Production build of publishable packages
mise run ci                   # Full validation: lint -> typecheck -> test -> test-integration -> smoke-test
mise run coach-check-project  # Read-only TypeScript readiness (compiler, Node, policy, package manager)
mise run coach-baseline       # Full baseline scan with project.json architecture policy
mise run coach-branch         # This branch vs main with project.json architecture policy
mise run coach-top            # Baseline narrowed to the first 10 high-severity findings
```

Coach (`github:lousy-agents/coach` 0.10.0) is advisory. Keep it out of `mise run lint` and `mise run ci`. A finished scan exits 0 even when it found signals. An empty signal set is not a clean bill of health. `project.json` is read from the analyzed Git revision, so commit it before scanning. Scans read committed HEAD, not the dirty worktree. Host Node must be 24 or 26. The workspace TypeScript pin is 7.0.2.

### Coach tasks

Each task passes `--project-language typescript` and `--project-config project.json`. The three scan tasks also pass `--no-interactive` (a non-empty `CI` variable has the same effect) and `--fail-on-incomplete-coverage`. `--no-interactive` skips guided policy authoring and compiler-setup prompts so a pty cannot hang. `--check-project` rejects `--no-interactive` (usage error, exit 2); that command is read-only and does not prompt.

| Task | Command shape |
| --- | --- |
| `coach-check-project` | `--baseline --check-project`. Readiness only, not a scan. |
| `coach-baseline` | Full `--baseline` project scan. |
| `coach-branch` | Full `--base main` project scan. |
| `coach-top` | Same baseline analysis as `coach-baseline`, rendered with `--min-severity high --top 10`. |

`coach-check-project` fills `checks.package_manager` (npm, pnpm, or Bun from the selected root's manifest or lockfile, then the binary on `PATH`). It exits 0 even when gaps exist. Read `status`, `checks`, and `gaps`. With no policy, `checks.project_shape` and `checks.package_manager` stay `not_checked`.

`coach-baseline` and `coach-branch` print every signal. They omit `--min-severity` and `--top`. Advisory `architecture.layer_violation` and `architecture.layer_bypass` rank below `medium`, so `--min-severity medium` withholds them, and a `--top` cap can withhold them for the same reason. Those two rules are what `project.json` is for.

`coach-top` is a reading aid. `--min-severity high` shows only `complexity.cognitive_complexity` and `complexity.max_nesting_depth` at twice the rule threshold (cognitive complexity 30 and up, nesting depth 8 and up). `complexity.branch_density` stays `medium` at every value. `--top 10` then keeps the first 10 of what remains. Text prints a `withheld:` line with the counts and a see-all command. JSON adds `signals_withheld` (`below_min_severity`, `beyond_top`) only when a narrowing flag was set. `summary`, coverage, diagnostics, and the exit status still describe the full analysis, so `active_signals` can exceed the signals shown. Use `coach-baseline` for the architecture result.

`coach codesignal` takes no positional arguments. A stray operand is a usage error (exit 2) and drops nothing onto stdout.

### Report sections

Text finding blocks start with `rule_id:` and `severity:`. Project finding blocks print `severity:` beside `rule_id:`. Severity is `high`, `medium`, `advisory`, or `low`. Layer rules are `advisory`. Within one metric rule, findings are ordered by the metric divided by that rule's threshold, highest first. Different rules are not compared by magnitude.

A TypeScript `--project-config` report uses JSON `schema_version` `"2"` and adds:

- `project_scope` — what the scan looked at: `inclusion_rule`, `pattern_set`, revision, each root's `candidate_files` and `analyzed_files`, plus `matched_layers` and `unmatched_layers`. Text prints `Project scope:` before findings.
- `project_provenance` — what produced the report: `language`, `config_digest`, `selected_roots`, analyzer (`coach-ts-project-sidecar`), Node and compiler `runtime`, and per-revision `coverage` for `model`, `bypass`, and `reachability` (`complete`, `incomplete`, `not_run`, or `not_requested`). `package_manager` (`kind`, `version`, `origin`) is present when the committed snapshot agrees on npm, pnpm, or Bun. Text prints `Project provenance:`.
- `project_next_actions` — present when required coverage is complete and no configured layer match was found. Kinds: `record_baseline` (`--baseline` only; Coach persists nothing), `review_policy_coverage`, and `inspect_diagnostics` when the report has diagnostics. Text prints `Next actions:`. When that scan also has no file-local signals, text replaces the generic no-findings line with `Complete scan found no configured covered match.` When file-local signals exist, the layer result is `Project summary` (`active=0` on a clean baseline) plus those next actions.

`summary` always includes `unknown_signals`. It includes `files_unanalyzed` when that count is non-zero. `active_signals` is the length of `signals` after the include-resolved filter, before narrowing. In `--base` mode that total includes `resolved`, so it is not the count of problems at HEAD. Problems at HEAD are `introduced_signals` + `existing_signals` + `unknown_signals` (and `baseline_signals` under `--baseline`).

### Diagnostics and lifecycle

- Supported-language files that are untracked, staged, modified, or unmerged: one `worktree_changes_not_analyzed` diagnostic per category (count, up to five paths).
- Only other files dirty: `worktree_not_clean`.
- `git status` itself fails: `worktree_status_check_failed`.
- A `--project-config` scan with uncommitted changes under a selected root, the policy file, or package-manager / `tsconfig` metadata: `worktree_report_reflects_committed_head`. The report still describes committed HEAD. A dirty supported-language file can also produce `worktree_changes_not_analyzed`.
- `--base` analyzes git rename (`R`) and copy (`C`) new paths (`--find-renames` at 50% similarity and `--find-copies-harder`). Without old-path continuity the lifecycle is `unknown` and the path gets `continuity_not_determined`.
- A project finding that would have been `introduced` on a rename/copy new path, or `resolved` on the old path, is `lifecycle: unknown` instead. Each affected path gets `project_change_lifecycle_indeterminate` with `side` (`head` or `base`) and `revision` (that side's commit; for `base`, the merge-base, not the `--base` argument). Text appends `, side: <head|base>, revision: <sha>` on diagnostics that carry those fields.
- Added files (`A`) are `lifecycle: introduced` and count in `introduced_signals`. `unknown` is residual classification, not "new in this diff."
- Statuses `T`, `U`, `X`, and `B` stay `unsupported_change_type` and increment `summary.files_unanalyzed`.

Treat `unknown` together with `continuity_not_determined` or `project_change_lifecycle_indeterminate` as an incomplete comparison. A check that only watches `introduced_signals` will miss a pure rename.

### Exit codes

| Code | When |
| --- | --- |
| 0 | Analysis or `--check-project` finished. Findings, `--min-severity`, and `--top` do not change this. `--check-project` is 0 even with gaps. A dirty worktree does not change this. |
| 1 | Operational failure: not a git repo, missing `git`, unresolvable `--base`, empty repo, or I/O. |
| 2 | Usage (stray positional, invalid `--min-severity` or `--top`), invalid `--project-config`, or a TypeScript scan that cannot resolve a supported compiler or host Node. |
| 3 | Required project coverage is incomplete or did not run, and the scan passed `--fail-on-incomplete-coverage`. The report is still written to stdout. `--prepare-compiler` also uses 3 when it cannot resolve the revision or compute readiness. |

Required coverage means `model` is `complete` and `bypass` is `complete` or `not_requested`, on every analyzed side. A reachability gap alone does not make the scan incomplete. Exit 0 does not mean coverage was complete — read `project_provenance.coverage`. Exit 3 means the architecture scan did not finish cleanly; it does not mean layer findings were present.

### Left to a terminal

These stay off the mise tasks because they prompt, mutate a toolchain, or would hide the architecture result:

- `--prepare-compiler` — consented mise-only TypeScript compiler install. Needs a TTY, uses the network, and exits 2 under `--no-interactive`. This repo already pins TypeScript 7.0.2. If `checks.compiler` fails, run it on a terminal: `coach codesignal --baseline --prepare-compiler --project-language typescript --project-config project.json`.
- `--suggest-project-config` — interactive TypeScript policy authoring. `project.json` is already the committed policy. `--no-interactive` makes the command exit 2.
- `--build-target` — Go production reachability. These scans set `--project-language typescript`.

If a command fails, read the error, fix the root cause, and re-run the same command until it passes. Do not skip failures or weaken tests to force green.

## Validation

After substantive edits, validate the changed surface:

```bash
# Prefer scoped checks first
npx biome check path/to/file.ts
npm test path/to/file.test.ts

# Agent/instruction surface (this PR’s product tools)
npx tsx packages/cli/src/index.ts lint --skills --agents --hooks --instructions
npx tsx packages/cli/src/index.ts doctor --ci
```

If validation fails, fix the issue and re-run until green.

## Validation Suite

```bash
mise run ci
```

Runs lint, strict typecheck, unit tests, integration tests, and smoke tests (integration/smoke depend on build). If `mise run ci` fails, fix the reported step and re-run until it passes.

## Feedback Loop

1. Make a small change.
2. Run the narrowest relevant check (`mise run test`, `mise run lint`, or scoped biome/test).
3. If it fails, fix and re-run the same check.
4. Before commit, run `mise run ci`.
5. If `mise run ci` fails, fix and repeat until green.

## Verification

Confirm behavior matches intent:

- Code changes: tests cover the behavior; `mise run test` passes.
- Instruction/agent/skill changes: `lint --instructions` / `lint --agents` / `lint --skills` are clean for touched paths, or remaining warnings are pre-existing and understood.
- Multi-harness config: `doctor --ci` reports expected archetype and no new blocking defects.

## Before Commit

1. Run `mise run ci` and ensure it passes.
2. Confirm durable work is tracked on the GitHub issue/PR checklist (not only session todos).
3. Do not commit secrets, beads databases, or local-only machine state.
