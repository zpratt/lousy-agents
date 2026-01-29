---
applyTo: "src/**/*.{test,spec}.ts"
---

# Testing Conventions for REST API

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
7. Use Testcontainers for database integration tests.
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

- **DO** use constructor parameters, function parameters, or factory functions.
- **DO** pass test doubles through the existing public API of the code under test.
- **DO NOT** export special test-only functions like `_setTestDependencies()` or `_resetTestDependencies()`.
- **DO NOT** modify module-level state from tests.

### Good Example (Dependency Injection via Factory Function)

```typescript
// Production code - use-cases/create-user.ts
export interface UserRepository {
  create(user: Omit<User, 'id'>): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
}

export function createUserUseCase(repository: UserRepository) {
  return {
    async execute(userData: { name: string; email: string }) {
      const existing = await repository.findByEmail(userData.email);
      if (existing) {
        throw new Error('Email already exists');
      }
      return repository.create(userData);
    }
  };
}

// Test code
it("should create user when email is unique", async () => {
  const mockRepository = {
    create: vi.fn().mockResolvedValue({ id: "1", name: "John", email: "john@example.com" }),
    findByEmail: vi.fn().mockResolvedValue(null)
  };
  const useCase = createUserUseCase(mockRepository);
  
  const result = await useCase.execute({ name: "John", email: "john@example.com" });
  
  expect(result.id).toBe("1");
  expect(mockRepository.create).toHaveBeenCalled();
});
```

### Bad Example (Test-Only Exports)

```typescript
// ❌ BAD: Production code
let _repositoryOverride: any;

export function _setTestDependencies(deps: any) {
  _repositoryOverride = deps.repository;
}

export function createUser(userData: any) {
  const repository = _repositoryOverride || defaultRepository;
  return repository.create(userData);
}

// ❌ BAD: Test code
import { _setTestDependencies, createUser } from "./create-user";

beforeEach(() => {
  _setTestDependencies({ repository: mockRepository });
});
```

## Integration Testing with Testcontainers

Use Testcontainers for database integration tests. These tests verify the actual database interactions.

### Setup Pattern

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect } from 'kysely';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';

describe('User Repository Integration', () => {
  let container: StartedPostgreSqlContainer;
  let db: Kysely<Database>;

  beforeAll(async () => {
    // Start PostgreSQL container - takes time on first run
    container = await new PostgreSqlContainer()
      .withDatabase('test_db')
      .start();

    const sql = postgres({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      username: container.getUsername(),
      password: container.getPassword(),
    });

    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: sql }),
    });

    // Run migrations to set up schema
    await runMigrations(db);
  }, 60000); // Increase timeout for container startup

  beforeEach(async () => {
    // Clean up test data between tests
    await db.deleteFrom('users').execute();
  });

  afterAll(async () => {
    await db.destroy();
    await container.stop();
  });

  it('should persist user to database', async () => {
    // Test actual database operations
  });
});
```

### Running Integration Tests

```bash
# Run integration tests (requires Docker)
npm run test:integration

# Integration tests use a separate config file
# vitest.integration.config.ts with longer timeouts
```

### CI Configuration

Integration tests in GitHub Actions require Docker. The CI workflow should include:

```yaml
services:
  # No services needed - Testcontainers manages containers
  
steps:
  - name: Run integration tests
    run: npm run test:integration
    env:
      TESTCONTAINERS_RYUK_DISABLED: true  # Optional: disable Ryuk for faster cleanup
```

## API Route Testing

Test Fastify routes by creating a test server instance:

```typescript
import Fastify from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { userRoutes } from './user-routes';

describe('User Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(userRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /users/:id', () => {
    it('should return 200 with user data when user exists', async () => {
      // Arrange
      const userId = 'existing-user-id';
      
      // Act
      const response = await app.inject({
        method: 'GET',
        url: `/users/${userId}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: userId,
        name: expect.any(String),
      });
    });

    it('should return 404 when user does not exist', async () => {
      // Arrange
      const userId = 'non-existent-id';
      
      // Act
      const response = await app.inject({
        method: 'GET',
        url: `/users/${userId}`,
      });

      // Assert
      expect(response.statusCode).toBe(404);
    });
  });
});
```

## Dependencies

Install new test dependencies using: `npm install <package>@<exact-version>`
