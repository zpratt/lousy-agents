---
applyTo: "src/**/*.{ts,tsx}"
---

# Clean Architecture Instructions

## The Dependency Rule

Dependencies point inward only. Outer layers depend on inner layers, never the reverse.

**Layers (innermost to outermost):**
1. Entities — Enterprise business rules
2. Use Cases — Application business rules
3. Adapters — Interface converters (controllers, repositories, gateways)
4. Infrastructure — Frameworks, drivers, composition root

## Directory Structure

```
src/
├── domain/entities/           # Layer 1
├── application/
│   ├── use-cases/             # Layer 2
│   └── ports/                 # Interfaces for external dependencies
├── adapters/
│   ├── controllers/           # Layer 3: HTTP handling
│   ├── repositories/          # Layer 3: Data access
│   └── gateways/              # Layer 3: External services
└── infrastructure/            # Layer 4: Composition root, config
```

## Layer 1: Entities

**Location:** `src/domain/entities/`

- MUST NOT import from any other layer
- MUST NOT depend on frameworks or infrastructure
- MUST be plain TypeScript objects/classes with business logic
- MAY contain validation and business rules

```typescript
// src/domain/entities/user.ts
export interface User {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
}

export function createUser(props: Omit<User, 'id' | 'createdAt'>): User {
  return { id: crypto.randomUUID(), ...props, createdAt: new Date() };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

**Violations:**
- Importing Zod, Prisma, or any framework
- Importing from `application/`, `adapters/`, or `infrastructure/`
- Database operations or HTTP calls

## Layer 2: Use Cases

**Location:** `src/application/use-cases/`

- MUST only import from entities and ports (interfaces)
- MUST define input/output DTOs
- MUST define ports for external dependencies
- MUST NOT import concrete implementations

```typescript
// src/application/use-cases/create-user.ts
import type { User } from '../../domain/entities/user';
import { createUser, isValidEmail } from '../../domain/entities/user';

export interface CreateUserInput { email: string; name: string; }
export interface CreateUserOutput { user: User; }

// Ports - interfaces for dependencies
export interface UserRepository {
  save(user: User): Promise<void>;
  findByEmail(email: string): Promise<User | null>;
}

export class CreateUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    if (!isValidEmail(input.email)) throw new Error('Invalid email');
    
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) throw new Error('Email exists');
    
    const user = createUser(input);
    await this.userRepository.save(user);
    return { user };
  }
}
```

**Violations:**
- Importing `PrismaClient`, `express`, or any framework
- Importing from `adapters/` or `infrastructure/`
- Direct database or HTTP operations

## Layer 3: Adapters

**Location:** `src/adapters/`

- MUST implement ports defined by use cases
- MAY import from entities and use cases
- MAY use framework-specific code
- MUST NOT contain business logic

```typescript
// src/adapters/repositories/prisma-user-repository.ts
import type { PrismaClient } from '@prisma/client';
import type { User } from '../../domain/entities/user';
import type { UserRepository } from '../../application/use-cases/create-user';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(user: User): Promise<void> {
    await this.prisma.user.create({ data: user });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }
}
```

```typescript
// src/adapters/controllers/user-controller.ts
import { z } from 'zod';
import type { CreateUserUseCase } from '../../application/use-cases/create-user';

const Schema = z.object({ email: z.string().email(), name: z.string() });

export class UserController {
  constructor(private readonly createUser: CreateUserUseCase) {}

  async handleCreate(request: Request): Promise<Response> {
    const body = Schema.parse(await request.json());
    const result = await this.createUser.execute(body);
    return Response.json(result, { status: 201 });
  }
}
```

**Violations:**
- Business logic (age checks, discount calculations, validation rules)
- Domain decisions that should be in entities or use cases

## Layer 4: Infrastructure

**Location:** `src/infrastructure/`

- Composition root wires dependencies
- Framework configuration lives here
- MAY import from all layers

```typescript
// src/infrastructure/composition-root.ts
import { PrismaClient } from '@prisma/client';
import { CreateUserUseCase } from '../application/use-cases/create-user';
import { PrismaUserRepository } from '../adapters/repositories/prisma-user-repository';
import { UserController } from '../adapters/controllers/user-controller';

export function createContainer() {
  const prisma = new PrismaClient();
  const userRepository = new PrismaUserRepository(prisma);
  const createUserUseCase = new CreateUserUseCase(userRepository);
  return { userController: new UserController(createUserUseCase) };
}
```

## Import Rules Summary

| From | Entities | Use Cases | Adapters | Infrastructure |
|------|----------|-----------|----------|----------------|
| Entities | ✓ | ✗ | ✗ | ✗ |
| Use Cases | ✓ | ✓ | ✗ | ✗ |
| Adapters | ✓ | ✓ | ✓ | ✗ |
| Infrastructure | ✓ | ✓ | ✓ | ✓ |

## Anti-Patterns

**Anemic Domain Model:** Entities as data-only containers with logic in services. Put business rules in entities.

**Leaky Abstractions:** Ports exposing `sql: string` or `PrismaTransaction`. Use domain concepts only.

**Business Logic in Adapters:** Age checks or discount calculations in controllers. Move to entities/use cases.

**Framework Coupling:** Use cases accepting `Request`/`Response`. Use plain DTOs.

## Code Review Checklist

- Entities have zero imports from other layers
- Use cases define ports for all external dependencies
- Adapters implement ports, contain no business logic
- Only composition root instantiates concrete implementations
- Use cases testable with simple mocks (no DB, no HTTP)
