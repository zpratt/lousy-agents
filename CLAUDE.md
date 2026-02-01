# Project Instructions

Lousy Agents is a scaffolding tool that helps software engineers improve their workflow when leveraging AI agents. It provides patterns, instructions, and feedback loops for AI coding assistants.

See @.github/context/project.context.md for full project context.

---

## Commands

Mise manages all tools and Node versions. Use file-scoped commands for faster feedback during development. Run the full validation suite before commits.

```bash
# Core commands
mise run test            # Run tests (vitest)
npm run build            # Production build
mise run format-check    # Lint check
mise run format-fix      # Auto-fix lint/format

# File-scoped (faster feedback)
npx biome check path/to/file.ts
npm test path/to/file.test.ts

# Validation suite (run before commits)
mise run ci && npm run build

# Linting tasks
mise run actionlint      # Validate GitHub Actions
mise run yamllint        # Validate YAML
mise run lint            # Run all linting tools in parallel

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
6. **Refactor**: Clean up, remove duplication, keep tests green
7. **Validate**: `mise run ci && npm run build`

Task is NOT complete until all validation passes.

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

```
.github/           GitHub Actions workflows, Copilot instructions, specs
src/
  entities/        Layer 1: Business domain entities
  use-cases/       Layer 2: Application business rules
  gateways/        Layer 3: External system adapters
  commands/        Layer 3: CLI command handlers
  mcp/             Layer 3: MCP protocol adapters
  lib/             Layer 3: Configuration and utilities
  index.ts         Layer 4: Composition root (CLI)
  mcp-server.ts    Layer 4: Composition root (MCP server)
tests/             Test files (mirror src/ structure)
scripts/           Build, deploy, and test scripts
```

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
- Run lint and tests after EVERY change

---

## Testing Conventions

When writing or modifying test files (`*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx`):

**Mandatory**: Run `mise test` after modifying or creating tests.

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

**Mandatory**: Run `mise lint` after modifying workflows.

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

**Always do:**
- Write tests before implementation (TDD)
- Run lint and tests after every change
- Run full validation before commits
- Use existing patterns from codebase
- Work in small increments

**Ask first:**
- Adding new dependencies
- Changing project structure
- Modifying GitHub Actions workflows

**Never do:**
- Skip the TDD workflow
- Store secrets in code (use environment variables)
- Use Jest (use Vitest)
- Mock fetch directly (use MSW)
- Modify tests to pass without fixing root cause
- Add dependencies without explicit version numbers
- Use type assertions (`as Type`) on external/API data
