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
├── entities/                  # Layer 1: Business domain entities
├── use-cases/                 # Layer 2: Application business rules
├── gateways/                  # Layer 3: External system adapters (APIs, databases)
├── app/                       # Layer 4: Next.js App Router (pages, layouts)
│   ├── api/                   # API route handlers
│   ├── (routes)/              # Page routes
│   └── layout.tsx             # Root layout
├── components/                # Layer 3: React components (UI adapters)
│   ├── ui/                    # Primitive UI components
│   └── features/              # Feature-specific components
└── lib/                       # Layer 3: Configuration and utilities
```

## Layer 1: Entities

**Location:** `src/entities/`

- MUST NOT import from any other layer
- MUST NOT depend on frameworks or infrastructure
- MUST NOT depend on global APIs (e.g., `crypto.randomUUID()`, `Date.now()`)
- MUST be plain TypeScript objects/classes with business logic
- MAY contain validation and business rules
- ID generation and timestamps should be passed as parameters or handled by use cases

```typescript
// src/entities/user.ts
export type UserRole = "admin" | "member" | "guest";

export interface User {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly createdAt: Date;
}

export function isValidUserRole(role: string): role is UserRole {
  return ["admin", "member", "guest"].includes(role);
}

export function canAccessAdminPanel(user: User): boolean {
  return user.role === "admin";
}
```

**Violations:**
- Importing React, Next.js, or any framework
- Importing from `src/use-cases/`, `src/gateways/`, `src/components/`, or `src/lib/`
- Database operations or HTTP calls
- Using global APIs like `crypto.randomUUID()` or `Date.now()`

## Layer 2: Use Cases

**Location:** `src/use-cases/`

- MUST only import from entities and ports (interfaces)
- MUST define input/output DTOs
- MUST define ports for external dependencies
- MUST NOT import concrete implementations

```typescript
// src/use-cases/get-user-profile.ts
import type { User } from '../entities/user';

export interface GetUserProfileInput { userId: string; }
export interface GetUserProfileOutput { user: User; }

// Ports - interfaces for dependencies
export interface UserRepository {
  findById(userId: string): Promise<User | null>;
}

export class GetUserProfileUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: GetUserProfileInput): Promise<GetUserProfileOutput> {
    if (!input.userId) {
      throw new Error('User ID is required');
    }

    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new Error('User not found');
    }

    return { user };
  }
}
```

**Violations:**
- Importing React, Next.js, or any framework
- Importing from `gateways/`, `components/`, or `lib/`
- Database operations or HTTP calls directly

## Layer 3: Adapters

**Location:** `src/gateways/`, `src/components/`, and `src/lib/`

- MUST implement ports defined by use cases
- MAY import from entities and use cases
- MAY use framework-specific code
- MUST NOT contain business logic

### Gateways (Data Adapters)

```typescript
// src/gateways/prisma-user-repository.ts
import { prisma } from '@/lib/prisma';
import type { User } from '@/entities/user';
import type { UserRepository } from '@/use-cases/get-user-profile';

export class PrismaUserRepository implements UserRepository {
  async findById(userId: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role as User['role'],
      createdAt: user.createdAt,
    };
  }
}
```

### React Components (UI Adapters)

```typescript
// src/components/features/user-profile.tsx
'use client';

import { useEffect, useState } from 'react';
import type { User } from '@/entities/user';

interface UserProfileProps {
  userId: string;
}

export function UserProfile({ userId }: UserProfileProps) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(data => setUser(data.user));
  }, [userId]);

  if (!user) return <div>Loading...</div>;

  return (
    <div>
      <h1>{user.email}</h1>
      <p>Role: {user.role}</p>
    </div>
  );
}
```

**Violations:**
- Business logic (validation rules, authorization decisions)
- Domain decisions that should be in entities or use cases

## Layer 4: Infrastructure

**Location:** `src/app/` (Next.js App Router)

- Framework configuration lives here
- MAY import from all layers
- Wires dependencies together

```typescript
// src/app/api/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { GetUserProfileUseCase } from '@/use-cases/get-user-profile';
import { PrismaUserRepository } from '@/gateways/prisma-user-repository';

const userRepository = new PrismaUserRepository();
const getUserProfile = new GetUserProfileUseCase(userRepository);

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = await getUserProfile.execute({ userId: params.id });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 404 }
    );
  }
}
```

## Dependency Injection Patterns

### Constructor Injection (Preferred)

Always use constructor injection for dependencies. This makes dependencies explicit and enables easy testing.

```typescript
// ✅ Good - Constructor injection
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
}

// ❌ Bad - No dependency injection (hard to test, tightly coupled)
export class PrismaUserRepository implements UserRepository {
  async findById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id: userId } }); // Global import
  }
}
```

### Factory Functions

Factory functions are an alternative pattern that returns objects implementing ports. Useful for simpler adapters.

```typescript
// Factory function with dependency injection
export function createApiClient(
  baseUrl: string
): ApiClient {
  return {
    async get<T>(path: string): Promise<T> {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      return response.json();
    }
  };
}
```

## Import Rules Summary

| From | Entities | Use Cases | Gateways/Components/Lib | App (Infrastructure) |
|------|----------|-----------|-------------------------|---------------------|
| Entities | ✓ | ✗ | ✗ | ✗ |
| Use Cases | ✓ | ✓ | ✗ | ✗ |
| Gateways/Components/Lib | ✓ | ✓ | ✓ | ✗ |
| App (Infrastructure) | ✓ | ✓ | ✓ | ✓ |

## Anti-Patterns

**Anemic Domain Model:** Entities as data-only containers with logic in services. Put business rules in entities.

**Leaky Abstractions:** Ports exposing Prisma types or Response objects. Use domain concepts only.

**Business Logic in Components:** Authorization checks or validation in React components. Move to entities/use cases.

**Framework Coupling:** Use cases accepting Next.js Request objects. Use plain DTOs.

## Code Review Checklist

- Entities have zero imports from other layers
- Use cases define ports for all external dependencies
- Adapters implement ports, contain no business logic
- API routes wire dependencies (act as composition root)
- Use cases testable with simple mocks (no DB, no HTTP)
