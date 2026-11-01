---
applyTo: "packages/**/*.{test,spec}.{ts,tsx}"
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
      const input = 'test-value';

      const result = functionUnderTest(input);

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

1. Follow the Arrange-Act-Assert (AAA) pattern for ALL tests. Separate the three phases with blank lines; do NOT label them with comments.
2. Do NOT write comments in tests. Express scenarios, preconditions, fixtures, and the reason a control case exists through nested `describe` blocks and precise behavioral names, and pin non-obvious behavior with assertions instead of prose. The only exceptions are machine-readable directives (for example `// biome-ignore`) and a one-line note for an external constraint that neither names nor assertions can express.
3. Use spec-style tests with `describe` and `it` blocks.
4. Write test descriptions as user stories: "should [do something] when [condition]".
5. Focus on behavior, NOT implementation details.
6. Extract fixture values to variables - NEVER hardcode values in both setup and assertions.
7. Use `msw` to mock HTTP APIs - do NOT mock fetch or axios directly.
8. Avoid mocking third-party dependencies when possible.
9. Tests MUST be isolated - no shared state between tests.
10. Tests MUST be deterministic - same result every run.
11. Tests MUST run identically locally and in CI.
12. NEVER use partial mocks.
13. Test ALL conditional paths with meaningful assertions.
14. Test unhappy paths and edge cases, not just happy paths.
15. Every assertion should explain the expected behavior.
16. Write tests that would FAIL if production code regressed.
17. **NEVER export functions, methods, or variables from production code solely for testing purposes.**
18. **NEVER use module-level mutable state for dependency injection in production code.**

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
