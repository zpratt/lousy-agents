---
applyTo: "src/**/*.{test,spec}.{ts,tsx}"
---

# Testing Conventions

## MANDATORY: After Test Changes

Run `npm test` after modifying or creating tests to verify all tests pass.

## Test File Structure

Use this structure for all test files:

```typescript
import { describe, it, expect } from 'vitest';

describe('ComponentName', () => {
  describe('when [condition]', () => {
    it('should [expected behavior]', () => {
      // Arrange
      const input = 'test-value';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected-value');
    });
  });
});
```

## Test Data

- Use Chance.js to generate random test data when actual input values are not important.
- Generate Chance.js data that produces readable assertion failure messages.
- Use simple strings or numbers - avoid overly complex Chance.js configurations.

## Test Design Rules

1. Follow the Arrange-Act-Assert (AAA) pattern for ALL tests.
2. Use spec-style tests with `describe` and `it` blocks.
3. Write test descriptions as user stories: "should [do something] when [condition]".
4. Focus on behavior, NOT implementation details.
5. Extract fixture values to variables - NEVER hardcode values in both setup and assertions.
6. Use `msw` to mock HTTP APIs - do NOT mock fetch or axios directly.
7. Avoid mocking third-party dependencies when possible.
8. Tests MUST be isolated - no shared state between tests.
9. Tests MUST be deterministic - same result every run.
10. Tests MUST run identically locally and in CI.
11. NEVER use partial mocks.
12. Test ALL conditional paths with meaningful assertions.
13. Test unhappy paths and edge cases, not just happy paths.
14. Every assertion should explain the expected behavior.
15. Write tests that would FAIL if production code regressed.
16. **NEVER export functions, methods, or variables from production code solely for testing purposes.**
17. **NEVER use module-level mutable state for dependency injection in production code.**

## Dependency Injection for Testing

When you need to inject dependencies for testing:

- **DO** use constructor parameters, function parameters, or framework-provided mechanisms (e.g., context objects).
- **DO** pass test doubles through the existing public API of the code under test.
- **DO NOT** export special test-only functions like `_setTestDependencies()` or `_resetTestDependencies()`.
- **DO NOT** modify module-level state from tests.

### Good Example (Dependency Injection via Parameters)

```typescript
// Production code
export const initCommand = defineCommand({
  run: async (context: CommandContext) => {
    const prompt = context.data?.prompt || consola.prompt;
    const result = await prompt("What is your name?");
    // ... use result
  },
});

// Test code
it("should prompt the user", async () => {
  const mockPrompt = vi.fn().mockResolvedValue("John");
  
  await initCommand.run({
    rawArgs: [],
    args: { _: [] },
    cmd: initCommand,
    data: { prompt: mockPrompt },
  });
  
  expect(mockPrompt).toHaveBeenCalledWith("What is your name?");
});
```

### Bad Example (Test-Only Exports)

```typescript
// ❌ BAD: Production code
let _promptOverride: any;

export function _setTestDependencies(deps: any) {
  _promptOverride = deps.prompt;
}

export const initCommand = defineCommand({
  run: async () => {
    const prompt = _promptOverride || consola.prompt;
    // ...
  },
});

// ❌ BAD: Test code
import { _setTestDependencies, initCommand } from "./init.js";

beforeEach(() => {
  _setTestDependencies({ prompt: mockPrompt });
});
```

## Dependencies

Install new test dependencies using: `npm install <package>@<exact-version>`
