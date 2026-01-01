---
applyTo: "**"
---

# Next.js TDD Application

A Next.js TypeScript application following Test-Driven Development, Clean Architecture, and strict validation workflows.

## Commands

Run `nvm use` before any npm command. During development, use file-scoped commands for faster feedback, and run the full validation suite (`npx biome check && npm test && npm run build`) before commits.

```bash
# ALWAYS run first
nvm use

# Core commands
npm install              # Install deps (updates package-lock.json)
npm test                 # Run tests (vitest)
npm run build            # Production build
npx biome check          # Lint check
npx biome check --write  # Auto-fix lint/format

# File-scoped (faster feedback)
npx biome check path/to/file.ts
npm test path/to/file.test.ts

# Validation suite (run before commits)
npx biome check && npm test && npm run build

# Other
npm audit                # Security check
npm run lint:workflows   # Validate GitHub Actions (actionlint)
npm run lint:yaml        # Validate YAML (yamllint)
```

## Workflow: TDD Required

Follow this exact sequence for ALL code changes. Work in small increments — make one change at a time and validate before proceeding.

1. **Research**: Search codebase for existing patterns, components, utilities. Use Context7 MCP tools for library/API documentation.
2. **Write failing test**: Create test describing desired behavior
3. **Verify failure**: Run `npm test` — confirm clear failure message
4. **Implement minimal code**: Write just enough to pass
5. **Verify pass**: Run `npm test` — confirm pass
6. **Refactor**: Clean up, remove duplication, keep tests green
7. **Validate**: `npx biome check && npm test && npm run build`

Task is NOT complete until all validation passes.

## Tech Stack

- **Framework**: Next.js (React) — follow Next.js conventions
- **Language**: TypeScript (strict mode)
- **Testing**: Vitest (never Jest), MSW for HTTP mocking
- **Linting**: Biome (never ESLint/Prettier separately)
- **Logging**: Pino with JSON format and child loggers
- **HTTP**: fetch API only
- **Architecture**: Clean Architecture principles

## Project Structure

```
.github/           GitHub Actions workflows
src/               Application source code
  components/      React components
  pages/           Next.js pages and routes
  lib/             Utilities and helpers
tests/             Test files (mirror src/ structure)
scripts/           Build, deploy, and test scripts
.nvmrc             Node.js version (latest LTS)
```

## Code Style

```typescript
// ✅ Good - typed, small, single purpose, descriptive names, pure
async function fetchUserById(userId: string): Promise<User> {
  if (!userId) throw new Error('User ID required');
  const response = await fetch(`/api/users/${userId}`);
  const data = await response.json();
  return data as User;
}

// ❌ Bad - untyped, multiple responsibilities, temporal coupling, impure
async function doStuff(x) {
  console.log('fetching');
  globalState.loading = true;
  const response = await fetch('/api/users/' + x);
  return response.json();
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
- Run lint and tests after EVERY change

## Testing Standards

```typescript
// ✅ Good - deterministic, no conditionals, descriptive
describe('UserService', () => {
  it('returns user when ID is valid', async () => {
    const user = await fetchUserById('123');
    expect(user.id).toBe('123');
  });

  it('throws when ID is empty', async () => {
    await expect(fetchUserById('')).rejects.toThrow('User ID required');
  });
});
```

**Rules:**
- Use Vitest (never Jest)
- Mock HTTP with MSW (never mock fetch directly)
- Tests must be deterministic — same result every run
- Avoid conditional logic in tests unless absolutely necessary
- Ensure all code paths have corresponding tests
- Test happy paths, unhappy paths, and edge cases
- Never modify tests to pass without understanding root cause

## Dependencies

- Use latest LTS Node.js — check with `nvm ls-remote --lts`, update `.nvmrc`
- Pin ALL dependencies to exact versions (no ^ or ~)
- Use explicit version numbers when adding new dependencies
- Search npm for latest stable version before adding
- Run `npm audit` after any dependency change
- Ensure `package-lock.json` is updated correctly
- Use Dependabot to keep dependencies current

## GitHub Actions

- Validation must be automated via GitHub Actions and runnable locally the same way
- Validate all workflows using actionlint
- Validate all YAML files using yamllint
- Pin all 3rd party Actions to specific version or commit SHA
- Keep all 3rd party Actions updated to latest version

## Boundaries

**✅ Always do:**
- Run `nvm use` before any npm command
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
- Skip the TDD workflow
- Store secrets in code (use environment variables)
- Use Jest (use Vitest)
- Mock fetch directly (use MSW)
- Modify tests to pass without fixing root cause
- Add dependencies without explicit version numbers
