---
applyTo: "**"
---

# CLI Application

A TypeScript CLI application using citty for command handling and consola for terminal output, following Test-Driven Development, Clean Architecture, and strict validation workflows.

## Commands

Run `nvm use` before any npm command. During development, use file-scoped commands for faster feedback, and run the full validation suite (`npx biome check && npm test && npm run build`) before commits.

```bash
# ALWAYS run first
nvm use

# Core commands
npm install              # Install deps (updates package-lock.json)
npm test                 # Run tests (vitest)
npm run build            # Production build
npm run dev              # Start development with hot reload
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

1. **Research**: Search codebase for existing patterns, commands, utilities. Use Context7 MCP tools for library/API documentation.
2. **Write failing test**: Create test describing desired behavior
3. **Verify failure**: Run `npm test` — confirm clear failure message
4. **Implement minimal code**: Write just enough to pass
5. **Verify pass**: Run `npm test` — confirm pass
6. **Refactor**: Clean up, remove duplication, keep tests green
7. **Validate**: `npx biome check && npm test && npm run build`

Task is NOT complete until all validation passes.

## Tech Stack

- **Framework**: citty — lightweight CLI framework with command definitions and argument parsing
- **Language**: TypeScript (strict mode)
- **Terminal Output**: consola — elegant console logging with levels and formatting
- **Validation**: Zod for runtime validation of external data
- **Testing**: Vitest (never Jest), Chance.js for test fixtures
- **Linting**: Biome (never ESLint/Prettier separately)
- **HTTP**: fetch API only (for external service calls)
- **Architecture**: Clean Architecture principles

## Project Structure

```
.github/           GitHub Actions workflows
src/               Application source code
  entities/        Layer 1: Business domain entities
  use-cases/       Layer 2: Application business rules
  gateways/        Layer 3: External system adapters
  commands/        Layer 3: CLI command handlers
  lib/             Utilities and helpers
  index.ts         Application entry point
tests/             Test files (mirror src/ structure)
.nvmrc             Node.js version (latest LTS)
```

## Code Style

```typescript
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { z } from 'zod';

// Define schema for runtime validation
const ConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
});

type Config = z.infer<typeof ConfigSchema>;

// ✅ Good - small, typed, single purpose, descriptive names, runtime validation
async function loadConfig(filePath: string): Promise<Config> {
  if (!filePath) {
    throw new Error('File path required');
  }

  const content = await readFile(filePath, 'utf-8');
  const data: unknown = JSON.parse(content);
  return ConfigSchema.parse(data);
}

// ❌ Bad - untyped, no validation, multiple responsibilities
async function doStuff(x) {
  console.log('loading');
  const data = JSON.parse(await readFile(x));
  return data as Config;
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
- Run lint and tests after EVERY change

## Testing Standards

Tests are executable documentation. Use Arrange-Act-Assert pattern. Generate test fixtures with Chance.js.

```typescript
import Chance from 'chance';
import { describe, it, expect, vi } from 'vitest';
import { createConfigLoader } from './config-loader';

const chance = new Chance();

// ✅ Good - describes behavior, uses generated fixtures, mocks dependencies
describe('Config Loader', () => {
  describe('given a valid config file path', () => {
    it('loads and validates the configuration', async () => {
      // Arrange
      const configPath = chance.word() + '.json';
      const expectedConfig = {
        name: chance.word(),
        version: chance.semver(),
      };
      const mockReader = vi.fn().mockResolvedValue(JSON.stringify(expectedConfig));
      const loader = createConfigLoader(mockReader);

      // Act
      const result = await loader.load(configPath);

      // Assert
      expect(result).toEqual(expectedConfig);
      expect(mockReader).toHaveBeenCalledWith(configPath);
    });
  });

  describe('given an empty file path', () => {
    it('throws a validation error', async () => {
      // Arrange
      const mockReader = vi.fn();
      const loader = createConfigLoader(mockReader);

      // Act & Assert
      await expect(loader.load('')).rejects.toThrow('File path required');
    });
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
- Follow Arrange-Act-Assert pattern
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
- Validate all external data with Zod
- Use Context7 MCP tools for code generation and documentation

**⚠️ Ask first:**
- Adding new dependencies
- Changing project structure
- Modifying GitHub Actions workflows

**🚫 Never do:**
- Skip the TDD workflow
- Store secrets in code (use environment variables)
- Use Jest (use Vitest)
- Modify tests to pass without fixing root cause
- Add dependencies without explicit version numbers
- Use type assertions (`as Type`) on external/API data
