---
applyTo: "**"
---

## MANDATORY: Pre-Requisite

**CRITICAL**: Before running ANY npm or node commands, you MUST first run:
```
nvm use
```
This ensures the correct Node.js version from `.nvmrc` is active. Run this at the start of every session and after opening a new terminal.

## MANDATORY: Development Workflow (ALWAYS FOLLOW THIS ORDER)

**CRITICAL**: For ALL code changes (features, bug fixes, refactoring), you MUST follow this workflow in the exact order listed. Do NOT skip phases or change the sequence.

### Phase 1: Research & Design

Before writing any code or tests, research the implementation approach:

**For UI Changes:**
- Search for existing patterns in the codebase
- Check for reusable components or services

**For API/Backend Changes:**
- Search for existing patterns in the codebase
- Check for reusable utilities or services
- Review API design guidelines

**For All Changes:**
- Understand what needs to be built
- Consider edge cases and error scenarios
- Plan implementation approach
- Identify dependencies needed

### Phase 2: Test-Driven Development (TDD)

After understanding what to build, write tests BEFORE production code:

1. **Write a failing test** that describes the desired behavior
2. **Run the test** with `npm test` to verify it fails with a clear error message
3. **Review the failure message** to ensure it clearly describes what's missing

**This applies to ALL code changes:**
- New features (write test for feature before implementing)
- UI components (write test for component before creating it)
- Bug fixes (write test that reproduces bug before fixing)
- Refactoring (write test for current behavior before refactoring)

Do NOT proceed to Phase 3 until you have a failing test.

### Phase 3: Implementation (Red, Green, Refactor)

Follow the TDD cycle to implement functionality incrementally:

**Red:** Test fails (completed in Phase 2)

**Green:** Write just enough production code to make the test pass
1. **Implement minimal solution** - no gold-plating
2. **Run test** to verify it now passes

**Refactor:** Improve code while keeping tests green
1. **Clean up implementation** - improve structure, remove duplication
2. **Run tests** to ensure refactoring didn't break anything

**Repeat:** Add more tests for edge cases, then implement those features
- Write next failing test
- Make it pass
- Refactor
- Continue until feature is complete

### Phase 4: Validation

After all tests pass, run the complete validation suite:

1. **Lint check**: `npx biome check` - Fix any issues
2. **All tests**: `npm test` - Ensure nothing broke
3. **Build**: `npm run build` - Confirm production build works

Task is NOT complete until all validation passes.

---

## Common Commands

**note**: Before running any commands, ensure that you have selected the proper Node.js version using `nvm use`. `biome` should be used as much as possible. Run `npx biome check` to check for linting errors, and `npx biome format` to automatically fix formatting issues.

- **run test suite**: `npm test` - Runs the full test suite using vitest.
- **build project**: `npm run build` - Creates an optimized production build for Next.js in the `.next` directory.
- **project validation**: `npm run lint` - Runs the linter to check for code quality issues.
- **installing/updating dependencies**: `npm install` - Installs or updates project dependencies.
  - Always use this command to ensure `package-lock.json` is updated correctly
  - Always use explicit version numbers when adding new dependencies.
  - Always search npm for the most recent stable version of a package.
  - Always use `npm audit` to check for vulnerabilities after installing or updating dependencies.
- **lint GitHub Actions workflows**: `npm run lint:workflows` - Validates all GitHub Actions workflows using `actionlint` from the command line.
- **lint YAML files**: `npm run lint:yaml` - Validates all YAML files using `yamllint` from the command line.

## General Project Instructions

- Work in small increments - make one change at a time and validate before proceeding.
- Follow Clean Architecture principles.
- Use .gitignore to exclude files and directories that should not be committed to version control.
- This repository is a Next.js-based React application - follow Next.js conventions.
- Use Context7 MCP tools automatically for code generation, setup steps, or library/API documentation.

## General Code Conventions

- Before running any npm scripts or node commands, run `nvm use` to ensure the correct Node.js version.
- All code MUST pass linting and formatting checks before committing.
- Use npm scripts for builds, tests, and other tasks.
- Use `fetch` for all API requests.
- Keep cyclomatic complexity low - favor simple functional approaches.
- Functions and methods MUST have a single responsibility.
- Avoid god functions and classes - break them into smaller, focused units.
- Avoid repetitive code - extract reusable functions.
- Use idiomatic TypeScript features for clarity and maintainability.
- Extract functions when there are multiple code paths.
- Favor immutability and pure functions.
- Avoid temporal coupling.
- Remove all unused imports and variables.
- Run lint and tests after EVERY change.

## Application Dependency Conventions

- Use nvm for managing Node.js versions - run `nvm use` before any npm commands.
- Use the latest LTS version of Node.js - check with `nvm ls-remote --lts` and update `.nvmrc` accordingly.
- Pin ALL dependencies to exact versions in package.json (no ^ or ~ prefixes).
- Remove unused dependencies from the project.

## Operational Conventions

- Structure application logs in JSON format using pino with structured logging and log levels.
- Use child loggers to inject context into logs.

## Code Security Conventions

- Run `npm audit` to check for vulnerabilities and fix them.
- Use environment variables for injecting secrets - NEVER store secrets as constants in code.

## Engineering Practices

- Write unit tests for all new features and bug fixes (follow the TDD workflow above).
- All tests should be deterministic and produce the same result every time they are run.
- Do not modify tests to make them pass without understanding the root cause of the failure.
- Avoid conditional logic in tests, unless it is absolutely necessary.
- Ensure all code paths have corresponding tests that properly assert the expected behavior.
- Ensure unhappy and evil paths are tested as well as happy paths.
- Use descriptive names for variables, functions, and modules.
- Keep functions small and focused on a single task.
- Whenever testing asynchronous http requests, use `msw` to mock the requests instead of making requests real endpoints or mocking the http client directly.
- The entire project should have a robust validation process that is completely automated using GitHub Actions workflows, but should also be easy to run locally in the same way as the CI pipeline.
- Use `biome` for code formatting and linting to maintain a consistent code style across the project.
- Use `vitest` as the testing framework for unit and integration tests.
- Never use `jest` in this project.
- Ensure all YAML files are validated using `actionshub/yamllint`
- Ensure all 3rd party GitHub Actions used in workflows are pinned to a specific version or commit SHA.
- Ensure all 3rd party GitHub Actions used in workflows are using the latest version.
- Use `dependabot` to keep dependencies up to date.
