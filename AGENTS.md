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
mise run test            # Unit tests (vitest)
mise run lint            # All lint tools in parallel
npm run build            # Production build of publishable packages
mise run ci              # Full validation: lint -> test -> test-integration -> smoke-test
```

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

Runs lint, unit tests, integration tests, and smoke tests (integration/smoke depend on build). If `mise run ci` fails, fix the reported step and re-run until it passes.

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
