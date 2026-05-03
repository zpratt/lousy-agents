# DESIGN.md — Lesson Capture and Context Injection (v1)

This document locks the load-bearing v1 decisions. Every implementation task references this contract. Do not add features listed under Out of Scope.

## Architecture Decisions

### Storage

Lessons live at `.lousy-agents/lessons/<slug>.md`. One file per lesson. Committed to the repository. Git is the audit trail. No database, no hidden state, no external storage.

### Lesson Types

Exactly two: `invariant` (project-scoped, fires broadly on SessionStart and any matching path/tag/pattern) and `pattern` (file-specific recurring concern, fires on path/tag/pattern match only). No third type in v1.

### Authorship

Agents write lessons using their normal Write/Edit tools. No custom MCP lesson-authoring API. The runtime is passive: it reads and injects lessons but never creates or modifies them. Schema changes are documentation changes.

### Capture Trigger

Stop and SubagentStop hooks are wired independently; neither takes priority. SubagentStop captures findings local to the subagent scope before that context is lost. Stop captures main-agent and session-level findings. The agent decides what to capture and writes files. The runtime stays passive.

### Injection

PreToolUse hook for Edit/Write calls the fixed command `lousy-agents context` and passes Claude Code hook input JSON on stdin. The command extracts the file path from validated hook input internally — file paths are never interpolated into shell command strings. Manual/debug invocations may use repeated `--files` flags. SessionStart hook injects all `invariant` lessons at session open.

### Matching

Path globs (picomatch@4.0.4, `{ dot: false, nocase: false }`), tag matches (against Claude `tool_name`), and literal substring search against file content only. No regex matching on untrusted file content. No model calls in PreToolUse. No embedding similarity.

## Constraints

### Slug Format

Slugs must match `^[a-z0-9-]+$`. Path separators (`/`, `\`) and dot-dot sequences (`..`) are invalid. Malformed slugs cause linter rejection; the runtime skips invalid lesson files with a warning.

### Resource Caps

| Cap | Value |
| --- | ----- |
| Max lesson files per invocation | 500 |
| Max aggregate lesson bytes | 20 MB |
| Max lesson file size | 1 MB |
| Max `triggers.paths` entries | 100 |
| Max `triggers.tags` entries | 100 |
| Max `triggers.patterns` entries | 50 |
| Max length per path/tag string | 200 characters |
| Max length per pattern string | 200 characters |

YAML alias/anchor expansion is disabled (`maxAliasCount: 0`) to prevent anchor-bomb OOM.

### Error Behavior

| Component | Stance |
| --------- | ------ |
| `lousy-agents context` | Fail-open — invalid/oversized lessons skip with warning; unreadable directory returns empty result and exits zero |
| `lousy-agents lint lessons` | Fail-closed — any invalid lesson → exit non-zero |
| `lousy-agents init-hooks` | Fail-closed — any read/write or parse error → exit non-zero |
| `lousy-agents capture` | Fail-open — absent/unparseable hook input → warning on stderr, no prompt, exit zero |

## Out of Scope (v1)

- `try-lesson` simulation command
- Model-assisted relevance scoring or lesson clustering
- Embedding similarity matching
- GitHub PR comment or Actions log integration
- External lesson sources or multi-repo sharing
- Telemetry, analytics, or lesson scoring
- `fire_count` / `last_fired` frontmatter fields (deferred — no automated writer exists)
- Custom MCP lesson-authoring API
- Retro or triage UI
