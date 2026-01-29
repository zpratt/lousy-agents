---
applyTo: "**"
---

# Fastify REST API Application

A Fastify TypeScript REST API following Test-Driven Development, Clean Architecture, and strict validation workflows with PostgreSQL database access via Kysely.

## Commands

Run `nvm use` before any npm command. During development, use file-scoped commands for faster feedback, and run the full validation suite (`npx biome check && npm test && npm run build`) before commits.

```bash
# ALWAYS run first
nvm use

# Core commands
npm install              # Install deps (updates package-lock.json)
npm test                 # Run unit tests (vitest)
npm run test:integration # Run integration tests with Testcontainers
npm run build            # Production build
npm run dev              # Start development server with hot reload
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
npm run db:migrate       # Run database migrations
```

## Workflow: TDD Required

Follow this exact sequence for ALL code changes. Work in small increments — make one change at a time and validate before proceeding.

1. **Research**: Search codebase for existing patterns, routes, utilities. Use Context7 MCP tools for library/API documentation.
2. **Write failing test**: Create test describing desired behavior
3. **Verify failure**: Run `npm test` — confirm clear failure message
4. **Implement minimal code**: Write just enough to pass
5. **Verify pass**: Run `npm test` — confirm pass
6. **Refactor**: Clean up, remove duplication, keep tests green
7. **Validate**: `npx biome check && npm test && npm run build`

Task is NOT complete until all validation passes.

## Tech Stack

- **Framework**: Fastify — high performance, extensible Node.js web framework
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL with Kysely (type-safe SQL query builder) + Postgres.js (driver)
- **Validation**: Zod for runtime validation of request/response data
- **Testing**: Vitest (never Jest), Testcontainers for database integration tests, Chance.js for test fixtures
- **Linting**: Biome (never ESLint/Prettier separately)
- **Logging**: Pino with JSON format and child loggers
- **HTTP**: fetch API only (for external service calls)
- **Architecture**: Clean Architecture principles

## Project Structure

```
.github/           GitHub Actions workflows
src/               Application source code
  entities/        Layer 1: Business domain entities
  use-cases/       Layer 2: Application business rules
  gateways/        Layer 3: Database and external service adapters
  routes/          Layer 3: Fastify route handlers
  plugins/         Fastify plugins (auth, validation, etc.)
  db/              Database configuration and migrations
  lib/             Utilities and helpers
  index.ts         Application entry point
tests/             Test files (mirror src/ structure)
.nvmrc             Node.js version (latest LTS)
```

## Code Style

```typescript
import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Define schema for runtime validation
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;

// ✅ Good - small, typed, single purpose, descriptive names, runtime validation
async function getUserById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params;

  if (!id) {
    return reply.badRequest('User ID required');
  }

  const user = await userRepository.findById(id);

  if (!user) {
    return reply.notFound(`User ${id} not found`);
  }

  return reply.send(UserSchema.parse(user));
}

// ❌ Bad - untyped, no validation, multiple responsibilities, no error handling
async function doStuff(req, reply) {
  console.log('getting user');
  const user = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  return user;
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
- Use Fastify's built-in reply methods for error responses
- Run lint and tests after EVERY change

## Database Access with Kysely

Use Kysely for type-safe database queries. Never use raw SQL strings without Kysely's query builder.

```typescript
import { Kysely, PostgresDialect } from 'kysely';
import postgres from 'postgres';

// Define database schema types
interface Database {
  users: UserTable;
  posts: PostTable;
}

interface UserTable {
  id: string;
  name: string;
  email: string;
  created_at: Date;
}

// Create Kysely instance
const sql = postgres({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: sql }),
});

// ✅ Good - type-safe queries
async function findUserById(id: string): Promise<User | undefined> {
  return db
    .selectFrom('users')
    .select(['id', 'name', 'email'])
    .where('id', '=', id)
    .executeTakeFirst();
}

// ✅ Good - type-safe inserts
async function createUser(user: Omit<User, 'id'>): Promise<User> {
  return db
    .insertInto('users')
    .values({ ...user, id: crypto.randomUUID() })
    .returningAll()
    .executeTakeFirstOrThrow();
}

// ❌ Bad - raw SQL without type safety
async function findUser(id: string) {
  return db.raw(`SELECT * FROM users WHERE id = '${id}'`);
}
```

## Testing Standards

Tests are executable documentation. Use Arrange-Act-Assert pattern. Use Testcontainers for database integration tests. Generate test fixtures with Chance.js.

### Unit Tests

```typescript
import Chance from 'chance';
import { describe, it, expect, vi } from 'vitest';
import { createUserUseCase } from './create-user';

const chance = new Chance();

// ✅ Good - describes behavior, uses generated fixtures, mocks repository
describe('Create User Use Case', () => {
  describe('given valid user data', () => {
    it('creates the user and returns it', async () => {
      // Arrange
      const userData = {
        name: chance.name(),
        email: chance.email(),
      };
      const expectedUser = { id: chance.guid(), ...userData };
      const mockRepository = {
        create: vi.fn().mockResolvedValue(expectedUser),
        findByEmail: vi.fn().mockResolvedValue(null),
      };
      const useCase = createUserUseCase(mockRepository);

      // Act
      const result = await useCase.execute(userData);

      // Assert
      expect(result).toEqual(expectedUser);
      expect(mockRepository.create).toHaveBeenCalledWith(userData);
    });
  });

  describe('given an email that already exists', () => {
    it('throws a conflict error', async () => {
      // Arrange
      const existingEmail = chance.email();
      const userData = { name: chance.name(), email: existingEmail };
      const mockRepository = {
        create: vi.fn(),
        findByEmail: vi.fn().mockResolvedValue({ id: chance.guid(), ...userData }),
      };
      const useCase = createUserUseCase(mockRepository);

      // Act & Assert
      await expect(useCase.execute(userData)).rejects.toThrow('Email already exists');
    });
  });
});
```

### Integration Tests with Testcontainers

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect } from 'kysely';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { UserRepository } from './user-repository';

describe('User Repository Integration', () => {
  let container: StartedPostgreSqlContainer;
  let db: Kysely<Database>;
  let repository: UserRepository;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer()
      .withDatabase('test_db')
      .start();

    // Create database connection
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

    // Run migrations
    await runMigrations(db);

    repository = new UserRepository(db);
  }, 60000);

  afterAll(async () => {
    await db.destroy();
    await container.stop();
  });

  describe('given a new user', () => {
    it('persists the user to the database', async () => {
      // Arrange
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      // Act
      const created = await repository.create(userData);

      // Assert
      expect(created.id).toBeDefined();
      expect(created.name).toBe(userData.name);
      expect(created.email).toBe(userData.email);

      // Verify persistence
      const found = await repository.findById(created.id);
      expect(found).toEqual(created);
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
- Use Testcontainers for database integration tests
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
- Integration tests require Docker for Testcontainers
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
- Use Kysely for all database queries
- Validate all request/response data with Zod
- Use Context7 MCP tools for code generation and documentation

**⚠️ Ask first:**
- Adding new dependencies
- Changing project structure
- Modifying GitHub Actions workflows
- Database schema changes
- Adding new database tables

**🚫 Never do:**
- Skip the TDD workflow
- Store secrets in code (use environment variables)
- Use Jest (use Vitest)
- Use raw SQL strings (use Kysely query builder)
- Modify tests to pass without fixing root cause
- Add dependencies without explicit version numbers
- Use type assertions (`as Type`) on external/API data
- Use Prisma or other ORMs (use Kysely)
