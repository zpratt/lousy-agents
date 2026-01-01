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

## Dependencies

Install new test dependencies using: `npm install <package>@<exact-version>`
