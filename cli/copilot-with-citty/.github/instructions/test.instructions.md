---
applyTo: "src/**/*.{test,spec}.ts"
---

# Testing Conventions for CLI

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
6. Use `msw` to mock external HTTP APIs - do NOT mock fetch directly.
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

- **DO** use constructor parameters, function parameters, or factory functions.
- **DO** pass test doubles through the existing public API of the code under test.
- **DO NOT** export special test-only functions like `_setTestDependencies()` or `_resetTestDependencies()`.
- **DO NOT** modify module-level state from tests.

### Good Example (Dependency Injection via Factory Function)

```typescript
// Production code - use-cases/process-input.ts
export interface InputReader {
  read(source: string): Promise<string>;
}

export function createInputProcessor(reader: InputReader) {
  return {
    async execute(source: string) {
      const content = await reader.read(source);
      if (!content.trim()) {
        throw new Error('Empty input');
      }
      return content;
    }
  };
}

// Test code
it("should process valid input", async () => {
  const mockReader = {
    read: vi.fn().mockResolvedValue("valid content")
  };
  const processor = createInputProcessor(mockReader);

  const result = await processor.execute("source.txt");

  expect(result).toBe("valid content");
  expect(mockReader.read).toHaveBeenCalledWith("source.txt");
});
```

### Bad Example (Test-Only Exports)

```typescript
// ❌ BAD: Production code
let _readerOverride: any;

export function _setTestDependencies(deps: any) {
  _readerOverride = deps.reader;
}

export function processInput(source: string) {
  const reader = _readerOverride || defaultReader;
  return reader.read(source);
}

// ❌ BAD: Test code
import { _setTestDependencies, processInput } from "./process-input";

beforeEach(() => {
  _setTestDependencies({ reader: mockReader });
});
```

## CLI Command Testing

Test citty commands by providing mock context:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myCommand } from './my-command';

describe('My Command', () => {
  describe('given valid arguments', () => {
    it('should execute the expected action', async () => {
      // Arrange
      const mockPrompt = vi.fn().mockResolvedValue('user-input');

      // Act
      await myCommand.run({
        rawArgs: ['--name', 'test'],
        args: { _: [], name: 'test' },
        cmd: myCommand,
        data: { prompt: mockPrompt },
      });

      // Assert
      expect(mockPrompt).not.toHaveBeenCalled();
    });
  });
});
```

## Dependencies

Install new test dependencies using: `npm install <package>@<exact-version>`
