# Project Instructions

Lousy Agents is a scaffolding tool that helps software engineers improve their workflow when leveraging AI agents. It provides patterns, instructions, and feedback loops for AI coding assistants.

See @.github/context/project.context.md for full project context.

---

## Commands

Mise manages all tools and Node versions. Use file-scoped commands for faster feedback during development.

```bash
# Core commands
mise run test            # Run tests (vitest)
mise run lint            # Run ALL linting tools in parallel (Biome, actionlint, yamllint, markdownlint, shellcheck, issue-form schemas, Trivy)
mise run format-check    # Biome only — code formatting + static analysis
mise run format-fix      # Auto-fix Biome lint/format issues
npm run build            # Production build

# Workspace-scoped commands
npm run build --workspace=packages/cli     # Build CLI only
npm run build --workspace=packages/mcp     # Build MCP server only
npm test --workspace=packages/cli          # Test a specific package

# File-scoped (faster feedback)
npx biome check path/to/file.ts
npm test path/to/file.test.ts

# Validation suite (run before commits)
mise run ci              # Runs: lint -> test -> smoke-test (smoke-test builds then exercises the CLI)

# Other
npm audit                # Security check
npm install              # Install deps
```

In GitHub Actions, `jdx/mise-action` automatically activates mise and makes all tools available in PATH.

---

## Workflow: TDD Required

Follow this sequence for ALL code changes. Work in small increments — one change at a time, validate before proceeding.

1. **Research**: Search codebase for existing patterns. Use Context7 MCP tools for library/API documentation.
2. **Write failing test**: Create test describing desired behavior
3. **Verify failure**: Run `mise run test` — confirm clear failure message
4. **Implement minimal code**: Write just enough to pass
5. **Verify pass**: Run `mise run test` — confirm pass
6. **Refactor**: Clean up, remove duplication
7. **Verify refactor**: Run `mise run test && mise run lint` — confirm tests still green and all linting passes
8. **Validate**: Run `mise run ci` — runs `mise run lint`, `mise run test`, and `mise run smoke-test` (which builds then exercises the CLI)

Task is NOT complete until step 8 validation passes. Never skip `mise run lint` — it runs Biome, actionlint, yamllint, markdownlint, shellcheck, issue-form schema validation, and Trivy.

---

## Tech Stack

- **Framework**: CLI using c12 for configuration, citty for terminal interactions
  - Prefer libraries from the [UnJS ecosystem](https://unjs.io/)
- **Language**: TypeScript (strict mode)
- **Validation**: Zod for runtime validation of external data
- **Testing**: Vitest (never Jest), MSW for HTTP mocking, Chance.js for test fixtures
- **Linting**: Biome (never ESLint/Prettier separately)
- **Logging**: Consola with JSON format and child loggers
- **HTTP**: fetch API only
- **Architecture**: Clean Architecture principles

---

## Project Structure

This is a monorepo using npm workspaces. The root `package.json` defines five
workspace packages under `packages/`:

```
.github/             GitHub Actions workflows, Copilot instructions, specs
packages/
  core/              @lousy-agents/core — shared entities, use cases, gateways
  cli/               @lousy-agents/cli — CLI entry point and commands
    src/
      entities/      Layer 1: Business domain entities
      use-cases/     Layer 2: Application business rules
      gateways/      Layer 3: External system adapters
      commands/      Layer 3: CLI command handlers
      lib/           Layer 3: Configuration and utilities
      index.ts       Layer 4: Composition root (CLI)
    api/             REST API scaffold templates
    ui/              Webapp scaffold templates
  mcp/               @lousy-agents/mcp — MCP server
    src/
      tools/         MCP tool handlers
      server.ts      MCP server setup
  action/            @lousy-agents/action — GitHub Action
  agent-shell/       @lousy-agents/agent-shell — npm script flight recorder
```

Tests are co-located with source files within each package (no separate `tests/` root directory).

---

## Code Style

- Always use TypeScript type hints
- Use descriptive names for variables, functions, and modules
- Functions must be small with single responsibility
- Favor immutability and pure functions
- Avoid temporal coupling
- Keep cyclomatic complexity low
- Remove all unused imports and variables
- Validate external data at runtime with Zod — never use type assertions (`as Type`) on API responses
- Always check `response.ok` when using fetch
- Run `mise run test && mise run lint` after every change

---

## Testing Conventions

When writing or modifying test files (`*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx`):

**Mandatory**: Run `mise run test` after modifying or creating tests.

See @.github/instructions/test.instructions.md for detailed conventions including test file structure, Chance.js usage, MSW mocking, dependency injection patterns, and all test design rules.

---

## Software Architecture

When working with source code in `src/`, follow Clean Architecture. Dependencies point inward only: Entities -> Use Cases -> Adapters -> Infrastructure.

See @.github/instructions/software-architecture.instructions.md for layer definitions, directory structure, dependency injection patterns (constructor injection and factory functions), import rules, and anti-patterns.

---

## Spec Development

When working with spec files (`*.spec.md`):

See @.github/instructions/spec.instructions.md for the full spec development workflow including EARS requirement syntax, user story format, value assessment, persona development, task design guidelines, Mermaid diagram requirements, and coding agent anti-patterns.

---

## CI/CD Pipelines

When modifying GitHub workflows (`.github/workflows/*.yml`, `.github/workflows/*.yaml`):

**Mandatory**: Run `mise run lint` after modifying workflows.

See @.github/instructions/pipeline.instructions.md for workflow structure requirements, action SHA pinning format, and runner requirements.

---

## Dependencies

- Pin ALL dependencies to exact versions (no `^` or `~`)
- Search npm for latest stable version before adding
- Use explicit version numbers: `npm install <package>@<exact-version>`
- Run `npm audit` after any dependency change
- Ensure `package-lock.json` is updated correctly

---

## Boundaries

**Definition of Done — a task is complete only when all three conditions are met:**
1. `mise run ci` exits 0 (runs `mise run lint` → `mise run test` → `mise run smoke-test`)
2. All acceptance criteria from the task or issue are satisfied
3. No warnings or errors were ignored or suppressed to reach exit 0

Do not signal task completion, propose a commit, or open a PR until these conditions are met.

**Always do:**
- Write tests before implementation (TDD)
- Run `mise run test && mise run lint` after every change
- Use existing patterns from codebase
- Work in small increments

**Ask first:**
- Adding new dependencies
- Changing project structure
- Modifying GitHub Actions workflows

**Never do:**
- Skip the TDD workflow
- Claim a task is complete without `mise run ci` exiting 0
- Store secrets in code (use environment variables)
- Use Jest (use Vitest)
- Mock fetch directly (use MSW)
- Modify tests to pass without fixing root cause
- Add dependencies without explicit version numbers
- Use type assertions (`as Type`) on external/API data

## Environment Setup

This project uses [mise](https://mise.jdx.dev/) for runtime management.

### Detected Runtimes

- **node**: .nvmrc (v24.14.0)

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
