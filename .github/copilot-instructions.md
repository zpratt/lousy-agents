---
applyTo: "**"
---

# Project Overview

**Mandatory**: Always read [](./context/project.context.md) for full project context before contributing.

## Shared Instruction Architecture

This repo serves instructions to both GitHub Copilot and Claude Code from a single set of canonical files, organized so each topic lives in exactly one place:

- **This file (`.github/copilot-instructions.md`)** is the canonical home for **repo-wide general guidance** (commands, TDD workflow, tech stack, project structure, code style, dependencies, boundaries, task tracking). Copilot code review always loads it; Claude Code imports it from the root `CLAUDE.md`.
- **`.github/instructions/*.instructions.md`** are the canonical home for **scoped domain rules** (testing, software architecture, specs, pipelines). Each has an `applyTo` glob. Copilot code review auto-applies them to matching changed files; Claude Code imports them from nested `CLAUDE.md` files placed in the matching directories. The general sections in this file deliberately summarize (not duplicate) those rules and link to them.

`CLAUDE.md` files use `@path/to/file` syntax (e.g., `@.github/copilot-instructions.md`) to import these shared files. This is Claude Code's native file reference mechanism — **not** a broken markdown link. Do not suggest converting `@path/to/file` references in any `CLAUDE.md` to markdown links. Copilot does **not** follow `@import` or markdown links, so anything Copilot review must see is kept physically in this file or in `.github/instructions/*`.

## Commands

Mise manages all tools and Node versions. If you haven't activated mise in your shell, run `mise activate` once or prefix commands with `mise exec --`. During development, use file-scoped commands for faster feedback, and run the full validation suite (`mise run ci`) before commits.

```bash
# One-time shell setup (or add to ~/.zshrc)
eval "$(mise activate zsh)"

# Core commands
mise run test            # Run tests (vitest)
mise run lint            # Run ALL linting tools in parallel (Biome, actionlint, yamllint, markdownlint, shellcheck, semgrep, dependency-cruiser, issue-form schemas)
mise run format-check    # Biome only — code formatting + static analysis
mise run format-fix      # Auto-fix Biome lint/format issues
npm run build            # Production build

# Workspace-scoped commands
npm run build --workspace=packages/cli     # Build CLI only
npm test -- packages/cli/src               # Test files in a specific package path

# File-scoped (faster feedback)
npx biome check path/to/file.ts
npm test path/to/file.test.ts

# Validation suite (run before commits)
mise run ci              # Runs: lint -> test -> test-integration -> smoke-test (smoke-test builds then exercises the CLI)

# Other
npm audit                # Security check
npm install              # Install deps (updates package-lock.json)
```

**Note**: In GitHub Actions, `jdx/mise-action` automatically activates mise and makes all tools available in PATH. No additional setup needed in CI.

This repository is an npm workspace monorepo. Run `npm install` once at the root to install all workspace dependencies. The root `npm run build` command builds the publishable packages: `packages/cli`, `packages/mcp`, and `packages/agent-shell`.

## Workflow: TDD Required

Follow this exact sequence for ALL code changes. Work in small increments — make one change at a time and validate before proceeding.

1. **Research**: Search codebase for existing patterns, components, utilities. Use Context7 MCP tools for library/API documentation.
2. **Write failing test**: Create test describing desired behavior
3. **Verify failure**: Run `mise run test` — confirm clear failure message
4. **Implement minimal code**: Write just enough to pass
5. **Verify pass**: Run `mise run test` — confirm pass
6. **Refactor**: Clean up, remove duplication, keep tests green
7. **Verify refactor**: Run `mise run test && mise run lint` — confirm tests still green and all linting passes
8. **Validate**: `mise run ci` — runs `lint -> test -> test-integration -> smoke-test`

Task is NOT complete until `mise run ci` exits 0.

## Tech Stack

- **Framework**: CLI using c12 for configuration management and citty for terminal interactions
  - When choosing additional libraries, prefer ones that integrate well with c12/citty (from [UnJS ecosystem](https://unjs.io/))
- **Language**: TypeScript (strict mode)
- **Validation**: Zod for runtime validation of external data
- **Testing**: Vitest (never Jest), MSW for HTTP mocking, Chance.js for test fixtures
- **Linting**: Biome (never ESLint/Prettier separately)
- **Logging**: Consola with JSON format and child loggers
- **HTTP**: fetch API only
- **Architecture**: Clean Architecture principles

## Project Structure

```
.github/           GitHub Actions workflows
packages/
  core/            Shared domain entities, use cases, gateways, and formatters
  cli/             Published CLI package and reference scaffold templates
  mcp/             Published MCP server package
  action/          Private GitHub Action package
  agent-shell/     Published npm script-shell telemetry package
scripts/           Build, deploy, and test scripts
.nvmrc             Node.js version (latest LTS)
```

## Code Style

```typescript
import { z } from 'zod';

// Define schema for runtime validation
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

type User = z.infer<typeof UserSchema>;

// ✅ Good - small, typed, single purpose, descriptive names, runtime validation
async function fetchUserById(userId: string): Promise<User> {
  if (!userId) {
    throw new Error('User ID required');
  }

  const response = await fetch(`/api/users/${userId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.status}`);
  }

  const data: unknown = await response.json();
  return UserSchema.parse(data);
}

// ❌ Bad - untyped, type assertion on external data, no validation, multiple responsibilities, impure (side effects: global state mutation)
async function doStuff(x) {
  console.log('fetching');
  globalState.loading = true;
  const response = await fetch('/api/users/' + x);
  return response.json() as User;
}
```

**Rules:**
- Always use TypeScript type hints
- Use descriptive names for variables, functions, and modules
- Functions must be small and have single responsibility
- Avoid god functions and classes — break into smaller, focused units
- Avoid repetitive code — extract reusable functions
- Extract functions when there are multiple code paths
- Favor immutability and pure functions
- Avoid temporal coupling
- Keep cyclomatic complexity low
- Remove all unused imports and variables
- Validate external data at runtime with Zod — never use type assertions (`as Type`) on API responses
- Always check `response.ok` when using fetch
- Run lint and tests after EVERY change

## Testing Standards

TDD is required (see the workflow above). Tests are executable documentation: describe behavior, not implementation. Use Vitest (never Jest), mock HTTP with MSW (never mock `fetch` directly), and generate fixtures with Chance.js. Follow Arrange-Act-Assert, name `describe`/`it` blocks as specifications, extract test data to constants (never duplicate values across arrange/act/assert), and cover happy paths, unhappy paths, and edge cases. Tests must be deterministic and isolated. Never modify a test to pass without fixing the root cause.

**Full conventions — including worked examples, the complete rule list, and dependency-injection-for-testing patterns — live in the canonical [`.github/instructions/test.instructions.md`](./instructions/test.instructions.md)**, which Copilot code review auto-applies to changed test files (`packages/**/*.{test,spec}.{ts,tsx}`).

## Dependencies

- Use latest LTS Node.js — check with `nvm ls-remote --lts`, update `.nvmrc`
- Pin ALL dependencies to exact versions (no ^ or ~)
- Use explicit version numbers when adding new dependencies
- Search npm for latest stable version before adding
- Run `npm audit` after any dependency change
- Ensure `package-lock.json` is updated correctly
- Use Dependabot to keep dependencies current

## GitHub Actions

Validation must be automated via GitHub Actions and runnable locally the same way. Every workflow needs test and lint jobs; validate workflows with actionlint and YAML with yamllint (`mise run lint` runs both). Pin all third-party Actions to an exact commit SHA with a version comment and keep them current.

**Full workflow conventions — SHA-pinning format, required jobs, runner requirements — live in the canonical [`.github/instructions/pipeline.instructions.md`](./instructions/pipeline.instructions.md)**, which Copilot code review auto-applies to changed workflow files (`.github/workflows/*.{yml,yaml}`).

## Boundaries

**✅ Always do:**
- Use `bd` (Beads) as the single source of truth for all task tracking — `bd create`, `bd show <id>`, `bd close <id>`, `bd list`, `bd query` — do not use ad-hoc lists or native agent task tools
- Write tests before implementation (TDD)
- Run lint and tests after every change
- Run full validation before commits
- Use existing patterns from codebase
- Work in small increments
- Use Context7 MCP tools for code generation and documentation

**⚠️ Ask first:**
- Adding new dependencies
- Changing project structure
- Modifying GitHub Actions workflows
- Database schema changes

**🚫 Never do:**
- Track tasks in ad-hoc markdown lists, inline comments, or any system other than Beads (`bd`). If `bd` is unavailable, stop and inform the user — do not substitute
- Skip the TDD workflow
- Store secrets in code (use environment variables)
- Use Jest (use Vitest)
- Mock fetch directly (use MSW)
- Modify tests to pass without fixing root cause
- Add dependencies without explicit version numbers
- Use type assertions (`as Type`) on external/API data

## Agent Protocols & Handoffs

### Definition of Done Protocol

Code changes require security and architecture review before completion.

### Handoff Procedure

When you have finished writing, refactoring, or fixing code:

1. **Validate Locally:** Run `mise run ci` to verify code quality (includes lint and tests).
2. **Invoke Reviewer:** End your final response with this call-to-action:

> **⚠️ Security & Architecture Check Required**
> I have completed the initial implementation. To ensure compliance with `.github/instructions/software-architecture.instructions.md` and security standards, please invoke the Hostile Reviewer:
>
> **@Reviewer check this code for evil paths and architectural violations.**

### Invocation Context

The `@Reviewer` invocation works in:

- **GitHub Copilot Chat** within an IDE
- **Pull Request comments** on GitHub.com
- **Issue discussions** where agent invocations are supported

If the Reviewer agent is unavailable or errors after invocation, proceed with manual review by a human maintainer.

### Escape Hatches

- **Maximum Review Cycles:** 3 rounds. After 3 cycles without resolution, escalate by adding the `needs-human-review` label and commenting `ESCALATE: Unable to resolve after 3 review cycles`.
- **Disputed Findings:** If you cannot address a finding or believe it's incorrect, reply with `DISPUTED: [reason]` and add the `needs-human-review` label.
- **Platform Limitations:** If `@Reviewer` invocation fails or is unsupported in the current context, document findings manually using the severity table format from `.github/agents/reviewer.md`.

### Context Awareness

- Read `.github/instructions/software-architecture.instructions.md` before modifying code in `packages/*/src/`.
- When handling user input (CLI args, file content, environment variables), validate with Zod and check for path traversal, command injection, and prototype pollution.
