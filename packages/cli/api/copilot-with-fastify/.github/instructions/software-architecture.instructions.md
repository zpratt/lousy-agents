---
applyTo: "src/**/*.ts"
---

# Clean Architecture Instructions for REST API

## The Dependency Rule

Dependencies point inward only. Outer layers depend on inner layers, never the reverse.

**Layers (innermost to outermost):**
1. Entities — Enterprise business rules
2. Use Cases — Application business rules
3. Adapters — Interface converters (routes, repositories, gateways)
4. Infrastructure — Frameworks, drivers, composition root

## Directory Structure

```
src/
├── entities/                  # Layer 1: Business domain entities
├── use-cases/                 # Layer 2: Application business rules
├── gateways/                  # Layer 3: Database and external service adapters
├── routes/                    # Layer 3: Fastify route handlers
├── plugins/                   # Layer 3: Fastify plugins
├── db/                        # Layer 3: Database configuration
│   ├── connection.ts          # Database connection factory
│   ├── migrations/            # Kysely migrations
│   └── types.ts               # Database schema types
├── lib/                       # Layer 3: Configuration and utilities
└── index.ts                   # Layer 4: Composition root
```

## Layer 1: Entities

**Location:** `src/entities/`

- MUST NOT import from any other layer
- MUST NOT depend on frameworks or infrastructure
- MUST NOT use non-deterministic or side-effect-producing global APIs (e.g., `crypto.randomUUID()`, `Date.now()`)
- MUST be plain TypeScript objects/classes with business logic
- MAY contain validation and business rules

```typescript
// src/entities/user.ts
export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: Date;
}

export interface CreateUserInput {
  readonly name: string;
  readonly email: string;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Note: currentDate is passed in to avoid non-deterministic Date() in entities
export function canUserBeDeleted(user: User, currentDate: Date): boolean {
  const oneWeekAgo = new Date(currentDate);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return user.createdAt < oneWeekAgo;
}
```

**Violations:**
- Importing Fastify, Kysely, or any framework
- Importing from `src/use-cases/`, `src/gateways/`, `src/routes/`, or `src/lib/`
- Database operations or HTTP calls
- Using non-deterministic global APIs like `crypto.randomUUID()` or `Date.now()`

## Layer 2: Use Cases

**Location:** `src/use-cases/`

- MUST only import from entities and ports (interfaces)
- MUST define input/output DTOs
- MUST define ports for external dependencies
- MUST NOT import concrete implementations

```typescript
// src/use-cases/create-user.ts
import type { User, CreateUserInput } from '../entities/user.js';
import { isValidEmail } from '../entities/user.js';

export interface CreateUserOutput {
  user: User;
}

// Port - interface for the repository
export interface UserRepository {
  create(id: string, input: CreateUserInput): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
}

// Port - interface for ID generation
export interface IdGenerator {
  generate(): string;
}

export function createUserUseCase(
  repository: UserRepository,
  idGenerator: IdGenerator
) {
  return {
    async execute(input: CreateUserInput): Promise<CreateUserOutput> {
      if (!input.name || input.name.trim().length === 0) {
        throw new Error('Name is required');
      }

      if (!isValidEmail(input.email)) {
        throw new Error('Invalid email format');
      }

      const existingUser = await repository.findByEmail(input.email);
      if (existingUser) {
        throw new Error('Email already exists');
      }

      const id = idGenerator.generate();
      const user = await repository.create(id, input);
      return { user };
    },
  };
}
```

**Violations:**
- Importing Fastify, Kysely, or any framework
- Importing from `gateways/`, `routes/`, or `lib/`
- Making database queries or HTTP calls directly

## Layer 3: Adapters

**Location:** `src/gateways/`, `src/routes/`, `src/plugins/`, and `src/db/`

### Database Gateway with Kysely

```typescript
// src/gateways/user-repository.ts
import type { Kysely } from 'kysely';
import type { User, CreateUserInput } from '../entities/user.js';
import type { UserRepository } from '../use-cases/create-user.js';
import type { Database } from '../db/types.js';

export function createUserRepository(db: Kysely<Database>): UserRepository {
  return {
    async create(id: string, input: CreateUserInput): Promise<User> {
      const result = await db
        .insertInto('users')
        .values({
          id,
          name: input.name,
          email: input.email,
          created_at: new Date(),
        })
        .returning(['id', 'name', 'email', 'created_at as createdAt'])
        .executeTakeFirstOrThrow();

      return result;
    },

    async findByEmail(email: string): Promise<User | null> {
      const result = await db
        .selectFrom('users')
        .select(['id', 'name', 'email', 'created_at as createdAt'])
        .where('email', '=', email)
        .executeTakeFirst();

      return result ?? null;
    },
  };
}
```

### Database Types

```typescript
// src/db/types.ts
export interface Database {
  users: UsersTable;
  posts: PostsTable;
}

export interface UsersTable {
  id: string;
  name: string;
  email: string;
  created_at: Date;
}

export interface PostsTable {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: Date;
}
```

### Database Connection with Postgres.js

```typescript
// src/db/connection.ts
import { Kysely, PostgresDialect } from 'kysely';
import postgres from 'postgres';
import type { Database } from './types.js';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export function createDatabase(config: DatabaseConfig): Kysely<Database> {
  const sql = postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: sql }),
  });
}
```

### Fastify Route Handlers

```typescript
// src/routes/user-routes.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { createUserUseCase } from '../use-cases/create-user.js';

const CreateUserBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

type CreateUserBody = z.infer<typeof CreateUserBodySchema>;

export function createUserRoutes(
  createUser: ReturnType<typeof createUserUseCase>
) {
  return async function userRoutes(app: FastifyInstance) {
    app.post<{ Body: CreateUserBody }>(
      '/users',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name', 'email'],
            properties: {
              name: { type: 'string', minLength: 1 },
              email: { type: 'string', format: 'email' },
            },
          },
        },
      },
      async (request: FastifyRequest<{ Body: CreateUserBody }>, reply: FastifyReply) => {
        try {
          const validated = CreateUserBodySchema.parse(request.body);
          const result = await createUser.execute(validated);
          return reply.status(201).send(result.user);
        } catch (error) {
          if (error instanceof Error && error.message === 'Email already exists') {
            return reply.status(409).send({ error: error.message });
          }
          throw error;
        }
      }
    );
  };
}
```

**Violations:**
- Business logic (validation rules, authorization decisions)
- Domain decisions that should be in entities or use cases
- Direct SQL strings without Kysely query builder

## Layer 4: Infrastructure

**Location:** `src/index.ts` (composition root)

The composition root wires all dependencies together.

```typescript
// src/index.ts
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import { createDatabase } from './db/connection.js';
import { createUserRepository } from './gateways/user-repository.js';
import { createUserUseCase } from './use-cases/create-user.js';
import { createUserRoutes } from './routes/user-routes.js';

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register plugins
  await app.register(sensible);
  await app.register(cors, { origin: true });

  // Create database connection
  const db = createDatabase({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'app',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  // Create repositories
  const userRepository = createUserRepository(db);

  // Create ID generator
  const idGenerator = { generate: () => crypto.randomUUID() };

  // Create use cases
  const createUser = createUserUseCase(userRepository, idGenerator);

  // Register routes
  await app.register(createUserRoutes(createUser));

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // Start server
  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: '0.0.0.0' });

  console.log(`Server listening on port ${port}`);
}

main().catch(console.error);
```

## Dependency Injection Patterns

### Factory Functions (Preferred)

Factory functions create adapter instances with injected dependencies.

```typescript
// ✅ Good - Factory function with dependency injection
export function createUserRepository(db: Kysely<Database>): UserRepository {
  return {
    async findById(id: string): Promise<User | null> {
      const result = await db
        .selectFrom('users')
        .where('id', '=', id)
        .selectAll()
        .executeTakeFirst();
      return result ?? null;
    },
  };
}

// Usage in composition root
const db = createDatabase(config);
const userRepository = createUserRepository(db);
const createUser = createUserUseCase(userRepository, idGenerator);
```

### Constructor Injection for Classes

Use constructor injection when classes are preferred.

```typescript
// ✅ Good - Constructor injection
export class UserRepositoryImpl implements UserRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.db
      .selectFrom('users')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
    return result ?? null;
  }
}
```

## Import Rules Summary

| From | Entities | Use Cases | Gateways/Routes/DB | Index (Root) |
|------|----------|-----------|-------------------|--------------|
| Entities | ✓ | ✗ | ✗ | ✗ |
| Use Cases | ✓ | ✓ | ✗ | ✗ |
| Gateways/Routes/DB | ✓ | ✓ | ✓ | ✗ |
| Index (Root) | ✓ | ✓ | ✓ | ✓ |

## Anti-Patterns

> ⚠️ **CRITICAL: The following anti-patterns MUST ALWAYS be avoided. Violating these patterns will result in code review rejection.**

**🚫 Anemic Domain Model:** Entities as data-only containers with logic in services. Put business rules in entities. **NEVER** create entities without behavior.

**🚫 Leaky Abstractions:** Repositories exposing Kysely types or raw SQL. Return domain entities only. **NEVER** expose database implementation details outside the gateway layer.

**🚫 Business Logic in Routes:** Authorization checks or validation in route handlers. Move to entities/use cases. **NEVER** put business rules in the route layer.

**🚫 Direct Database Access in Use Cases:** Use cases making Kysely queries directly. Use repository ports. **NEVER** import database libraries in use case files.

**🚫 Raw SQL Strings:** Using template strings for SQL. Always use Kysely query builder for type safety. **NEVER** use string interpolation for SQL queries.

## Code Review Checklist

- Entities have zero imports from other layers
- Use cases define ports for all external dependencies
- Repositories implement ports, contain no business logic
- Route handlers validate input with Zod, delegate to use cases
- Only composition root instantiates concrete implementations
- Use cases testable with simple mocks (no database, no HTTP)
- All database queries use Kysely query builder
