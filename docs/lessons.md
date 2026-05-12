# Agent Lessons

Agent Lessons is a durable knowledge system for Claude Code that accumulates project-specific findings across sessions. Relevant lessons are injected before file edits so agents avoid repeated mistakes without manual prompting. New lessons are captured at session end through normal Write/Edit operations.

## How It Works

1. **Setup** — `init-hooks` wires Claude Code hooks into `.claude/settings.json`
2. **Inject** — At each file edit the `context` hook command matches lessons to the file under edit and injects them as `additionalContext`
3. **Capture** — At session end the `capture` hook command prompts the agent to review findings and write or update lesson files
4. **Validate** — `lint lessons` validates committed lesson files against the schema

Lessons live in `.lousy-agents/lessons/` as Markdown files with YAML frontmatter. They are committed to the repository and versioned with your code.

---

## Quick Start

```bash
# Wire Claude Code hooks
npx @lousy-agents/cli init-hooks

# Validate existing lesson files
npx @lousy-agents/cli lint lessons
```

After running `init-hooks`, start a Claude Code session — lesson injection and capture are automatic.

---

## Commands

### `init-hooks`

Writes hook configuration into `.claude/settings.json` for lesson injection and capture.

```bash
npx @lousy-agents/cli init-hooks [options]
```

| Flag | Default | Description |
| --- | --- | --- |
| `--force` | `false` | Overwrite existing hook entries even if already configured |
| `--no-session-start` | `false` | Disable the `SessionStart` hook for invariant injection (enabled by default) |

**What it configures:**

- **`PreToolUse` hook** — runs `lousy-agents context` before every Edit/Write operation; injects matching lessons as `additionalContext`
- **`SessionStart` hook** — injects all `invariant`-typed lessons at session start (skip with `--no-session-start`)
- **`Stop` hook** — runs `lousy-agents capture` at session end; prompts the main agent to capture session-level findings
- **`SubagentStop` hook** — runs `lousy-agents capture` when a subagent completes; prompts subagent-scoped lesson capture

If `.claude/settings.json` already exists, unrelated settings are preserved. Existing hook entries are not overwritten unless `--force` is passed.

```bash
# First-time setup
npx @lousy-agents/cli init-hooks

# Re-run after updating lousy-agents — overwrite existing entries
npx @lousy-agents/cli init-hooks --force

# Skip SessionStart invariant injection
npx @lousy-agents/cli init-hooks --no-session-start
```

---

### `lint lessons`

Validates every file under `.lousy-agents/lessons/` against the lesson schema.

```bash
npx @lousy-agents/cli lint lessons
```

- Exits **zero** if all lessons are valid or if the directory does not exist
- Exits **non-zero** if any lesson has invalid frontmatter; reports the file path and validation reason
- Reports resource cap violations (trigger array length, trigger string length, file count, aggregate bytes)

```bash
# Validate all lessons; exits non-zero on any schema error
npx @lousy-agents/cli lint lessons
```

---

### `context` (hook command)

Injects relevant lessons into Claude Code hooks. This command is invoked automatically by the `PreToolUse` and `SessionStart` hooks configured by `init-hooks` — you do not call it directly during normal use.

The command reads Claude Code hook JSON from stdin, matches lessons to the file under edit, and writes a Claude Code `hookSpecificOutput` envelope to stdout.

**Debug invocation** (bypass stdin, supply file paths explicitly):

```bash
echo '{}' | npx @lousy-agents/cli context --files src/auth/policy.ts
```

| Flag | Description |
| --- | --- |
| `--files <paths>` | Comma-separated file paths to match against (overrides stdin; for debugging) |

---

### `capture` (hook command)

Generates a structured lesson-capture prompt for `Stop` and `SubagentStop` hooks. Like `context`, this command is wired automatically by `init-hooks` and is not called directly.

It reads Claude Code hook JSON from stdin and writes a capture prompt to stdout. The agent uses that prompt to review its session findings and write or update lesson files under `.lousy-agents/lessons/`.

---

## Lesson Schema

Lesson files live at `.lousy-agents/lessons/<slug>.md`. The filename stem should match the `slug` frontmatter field (convention; not enforced by the linter).

**Frontmatter fields:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `slug` | `string` | ✅ | Unique identifier matching `^[a-z0-9-]+$` (no path separators or dot-dot) |
| `title` | `string` | ✅ | Human-readable lesson title |
| `type` | `"invariant" \| "pattern"` | ✅ | `invariant` — always-on, injected at SessionStart; `pattern` — context-matched only |
| `created` | `YYYY-MM-DD` | ✅ | Creation date |
| `revised` | `YYYY-MM-DD` | ✅ | Last-revised date |
| `provenance` | `object[]` | ✅ | Source attribution (may be empty `[]`). Each entry: `{ pr: number, finding_id: string, facet: string }` |
| `triggers.paths` | `string[]` | ✅ | Glob patterns matched against the file under edit |
| `triggers.tags` | `string[]` | ✅ | Path segments or extensions matched against the file under edit (e.g. `ts`, `src`) |
| `triggers.patterns` | `string[]` | ✅ | Free-text patterns matched against file content |

A lesson is included in `additionalContext` when **any** of the following hold for the file under edit:
- **tags**: any tag matches a path segment or file extension of the file under edit
- **paths**: any glob in `triggers.paths` matches the file path
- **patterns**: any string in `triggers.patterns` appears as a literal substring in the file's content

Lessons with all three trigger arrays empty **do not match** on `PreToolUse` (absence is not a wildcard). The `context` command never calls an LLM for relevance scoring — matching is deterministic.

**Example lesson file:**

```markdown
---
slug: fail-closed-default
title: Use fail-closed defaults for policy decisions
type: invariant
created: 2026-05-02
revised: 2026-05-02
provenance: []
triggers:
  paths:
    - "src/policy/**"
    - "src/rules/**"
  tags:
    - "policy"
    - "decision"
  patterns:
    - "fail-closed"
---

When implementing policy or permission decisions, always default to **deny** when the outcome is uncertain.
```

---

## Resource Limits

The lesson system enforces caps to prevent hook latency from growing unbounded:

| Resource | Limit |
| --- | --- |
| Total lesson files | 500 |
| Per-file lesson content | 1 MB |
| Aggregate lesson content | 20 MB |
| `triggers.paths` / `triggers.tags` array length | 100 entries each |
| `triggers.paths` / `triggers.tags` entry length | 200 characters |
| `triggers.patterns` array length | 50 entries |
| `triggers.patterns` entry length | 200 characters |

`lint lessons` reports a validation error when any cap is exceeded.

---

## Related docs

- [`lint` command](lint.md) — the `lint lessons` subcommand lives here alongside skill, agent, hook, and instruction linting
- [agent-shell](../packages/agent-shell/README.md) — complementary observability layer for npm script execution
