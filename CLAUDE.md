# Project Instructions

Lousy Agents is a scaffolding tool that helps software engineers improve their workflow when leveraging AI agents. It provides patterns, instructions, and feedback loops for AI coding assistants.

See @.github/context/project.context.md for full project context.

## General engineering guidance (shared with Copilot)

All repo-wide engineering guidance — Commands, the TDD workflow, Tech Stack, Project Structure, Code Style, Dependencies, Task Tracking, and Boundaries — is maintained in one canonical place and imported here:

@.github/copilot-instructions.md

Do not duplicate that content below. To change a general rule, edit `.github/copilot-instructions.md` (it is the single source, and the file Copilot code review always loads).

## Instruction map

Guidance is organized so each topic lives in exactly one canonical file:

- **Repo-wide general rules** → `.github/copilot-instructions.md` (imported above).
- **Scoped domain rules** → `.github/instructions/*.instructions.md`. Each has an `applyTo` glob. Copilot code review auto-applies them to matching changed files; Claude Code loads them from the **nested `CLAUDE.md`** placed in the matching directory:
  - `packages/CLAUDE.md` → software-architecture + test conventions
  - `.github/workflows/CLAUDE.md` → pipeline conventions
  - `.github/specs/CLAUDE.md` → spec-development conventions

Keeping the deep domain rules in nested files (rather than importing all of them here) mirrors Copilot's `applyTo` scoping and keeps this root file lean: architecture/test/spec/pipeline guidance loads only when you are actually working in that area.

---

## Task Tracking (Claude-specific)

Beads (`bd`) is the single source of truth for all task tracking (see Boundaries in the imported guidance). For Claude Code specifically:

**Never** use Claude Code's native task tools (`TaskCreate`, `TaskList`, `TaskUpdate`, `TaskGet`, etc.) for project tasks — they are session-scoped and invisible to other agents and to Copilot. Use `bd create` / `bd show <id>` / `bd close <id>` / `bd list` / `bd query` instead. If `bd` is unavailable, stop and inform the user — do not fall back to native tools or ad-hoc lists.

## Skills

Reach for these project skills when the work matches:

- **`feature-to-plan`** — turn a feature request, idea, or backlog issue into a structured EARS-format spec.
- **`plan-to-graph`** — break a spec/master plan into a Beads (`bd`) dependency graph of epics and tasks.
- **`mutation-hunter`** — find test-coverage gaps by mutating production TypeScript and seeing which mutations survive.
- **`rugged-evil-tester`** — generate adversarial / security / boundary / injection tests for TypeScript.
- **`triaging-pr-reviews`** — triage and classify PR review comments (especially automated Copilot review) before acting on them.

## Memory

A persistent file-based memory lives under `~/.claude/projects/<repo-id>/memory/` with an index at `MEMORY.md`. Record durable, non-obvious facts there (user preferences, confirmed feedback, ongoing project constraints) — not things already captured by the repo, git history, or these instruction files.

## Review & subagent workflow

- Use **Explore/Plan subagents** for research and design when scope is uncertain or spans multiple areas; prefer your own tools for focused, well-understood changes.
- Before finishing code work, run a review pass: use `/security-review` or `/code-review` on the diff. This mirrors the `@Reviewer` security-and-architecture handoff described in the imported guidance — when handling user input (CLI args, file content, env vars), validate with Zod and check for path traversal, command injection, and prototype pollution.

---

## Environment Setup

This project uses [mise](https://mise.jdx.dev/) for runtime management.

### Detected Runtimes

- **node**: .nvmrc (v24.15.0)

### Package Managers

- **npm**: package.json with package-lock.json

### SessionStart Hooks

The following commands run automatically when a Claude Code session starts:

```bash
mise install
```

*Install runtimes from mise.toml*

```bash
npm ci
```

*Install Node.js dependencies with package-lock.json*
