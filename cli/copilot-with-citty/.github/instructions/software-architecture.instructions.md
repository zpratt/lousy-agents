---
applyTo: "src/**/*.ts"
---

# Clean Architecture Instructions for CLI

## The Dependency Rule

Dependencies point inward only. Outer layers depend on inner layers, never the reverse.

**Layers (innermost to outermost):**
1. Entities — Enterprise business rules
2. Use Cases — Application business rules
3. Adapters — Interface converters (commands, gateways)
4. Infrastructure — Frameworks, drivers, composition root

## Directory Structure

```
src/
├── entities/                  # Layer 1: Business domain entities
├── use-cases/                 # Layer 2: Application business rules
├── gateways/                  # Layer 3: External system adapters (file system, APIs)
├── commands/                  # Layer 3: CLI command handlers
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
// src/entities/project.ts
export interface Project {
  readonly name: string;
  readonly version: string;
  readonly type: ProjectType;
}

export type ProjectType = 'cli' | 'webapp' | 'api';

export function isValidProjectName(name: string): boolean {
  return /^[a-z][a-z0-9._-]*$/.test(name) && name.length <= 214;
}
```

## Layer 2: Use Cases

**Location:** `src/use-cases/`

- MUST only import from entities and ports (interfaces)
- MUST define input/output DTOs
- MUST define ports for external dependencies
- MUST NOT import concrete implementations

```typescript
// src/use-cases/initialize-project.ts
import type { Project } from '../entities/project';

export interface InitializeProjectInput {
  name: string;
  type: string;
}

export interface ProjectGateway {
  createStructure(project: Project): Promise<void>;
}

export class InitializeProjectUseCase {
  constructor(private readonly gateway: ProjectGateway) {}

  async execute(input: InitializeProjectInput): Promise<void> {
    if (!input.name) {
      throw new Error('Project name is required');
    }
    await this.gateway.createStructure({
      name: input.name,
      version: '0.1.0',
      type: input.type as any,
    });
  }
}
```

## Layer 3: Adapters

**Location:** `src/commands/`, `src/gateways/`, and `src/lib/`

- MUST implement ports defined by use cases
- MAY import from entities and use cases
- MAY use framework-specific code
- MUST NOT contain business logic

```typescript
// src/commands/init.ts
import { defineCommand } from 'citty';
import { consola } from 'consola';

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a new project',
  },
  args: {
    name: { type: 'string', description: 'Project name' },
  },
  async run({ args }) {
    consola.info(`Initializing project: ${args.name}`);
    // Delegate to use case
  },
});
```

## Layer 4: Infrastructure

**Location:** `src/index.ts` (composition root)

- Composition root wires dependencies
- MAY import from all layers

```typescript
// src/index.ts
import { defineCommand, runMain } from 'citty';
import { initCommand } from './commands/init';

const main = defineCommand({
  meta: { name: 'my-cli', description: 'My CLI tool' },
  subCommands: { init: initCommand },
});

runMain(main);
```

## Import Rules Summary

| From | Entities | Use Cases | Commands/Gateways/Lib | Index (Root) |
|------|----------|-----------|----------------------|--------------|
| Entities | ✓ | ✗ | ✗ | ✗ |
| Use Cases | ✓ | ✓ | ✗ | ✗ |
| Commands/Gateways/Lib | ✓ | ✓ | ✓ | ✗ |
| Index (Root) | ✓ | ✓ | ✓ | ✓ |

## Anti-Patterns

**Anemic Domain Model:** Entities as data-only containers with logic in services. Put business rules in entities.

**Leaky Abstractions:** Ports exposing framework types. Use domain concepts only.

**Business Logic in Adapters:** Validation rules or decisions in commands. Move to entities/use cases.

**Framework Coupling:** Use cases accepting CLI `args` objects. Use plain DTOs.

## Code Review Checklist

- Entities have zero imports from other layers
- Use cases define ports for all external dependencies
- Adapters implement ports, contain no business logic
- Only composition root instantiates concrete implementations
- Use cases testable with simple mocks (no file system, no HTTP)
