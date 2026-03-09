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
- **Validation**: Zod for runtime validation of external data
- **Testing**: Vitest (never Jest), MSW for HTTP mocking, Chance.js for test fixtures
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

Tests are executable documentation. Use Arrange-Act-Assert pattern. Mock HTTP with MSW. Generate test fixtures with Chance.js.

```typescript
import Chance from 'chance';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { fetchUserById } from './user-service';

const chance = new Chance();
const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ✅ Good - describes behavior, reads like documentation, uses generated fixtures
describe('User retrieval', () => {
  describe('given a valid user ID', () => {
    it('returns the user details from the API', async () => {
      // Arrange
      const userId = chance.guid();
      const expectedUser = { id: userId, name: chance.name() };
      server.use(
        http.get(`/api/users/${userId}`, () => {
          return HttpResponse.json(expectedUser);
        })
      );

      // Act
      const result = await fetchUserById(userId);

      // Assert
      expect(result).toEqual(expectedUser);
    });
  });

  describe('given an empty user ID', () => {
    it('rejects with a validation error', async () => {
      // Arrange - no server setup needed, validation happens before fetch

      // Act & Assert
      await expect(fetchUserById('')).rejects.toThrow('User ID required');
    });
  });

  describe('given a non-existent user ID', () => {
    it('rejects with an error containing the status code', async () => {
      // Arrange
      const userId = chance.guid();
      server.use(
        http.get(`/api/users/${userId}`, () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      // Act & Assert
      await expect(fetchUserById(userId)).rejects.toThrow(
        'Failed to fetch user: 404'
      );
    });
  });

  describe('given an invalid response shape', () => {
    it('rejects with a validation error', async () => {
      // Arrange
      const userId = chance.guid();
      server.use(
        http.get(`/api/users/${userId}`, () => {
          return HttpResponse.json({ invalid: 'data' });
        })
      );

      // Act & Assert
      await expect(fetchUserById(userId)).rejects.toThrow();
    });
  });
});

// ❌ Bad - implementation-focused, hardcoded values, duplicated test data
describe('fetchUserById', () => {
  it('works', async () => {
    const user = { id: '123', name: 'Alice' };
    server.use(
      http.get('/api/users/123', () => HttpResponse.json(user))
    );
    const result = await fetchUserById('123'); // duplicated '123' across arrange/act/assert
    expect(result).toEqual(user);
  });
});
```

**Rules:**
- Tests are executable documentation — describe behavior, not implementation
- Name `describe` blocks for features/scenarios, not function names
- Name `it` blocks as specifications that read as complete sentences
- Use nested `describe` blocks for "given/when" context
- Use Chance.js to generate test fixtures — avoid hardcoded test data
- Extract test data to constants — never duplicate values across arrange/act/assert
- Use Vitest (never Jest)
- Mock HTTP with MSW (never mock fetch directly)
- Follow Arrange-Act-Assert pattern
- Tests must be deterministic — same result every run
- Reset handlers between tests for isolation
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
- Use type assertions (`as Type`) on external/API data
