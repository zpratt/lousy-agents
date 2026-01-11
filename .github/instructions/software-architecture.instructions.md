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
├── gateways/                  # Layer 3: External system adapters (file system, APIs)
├── commands/                  # Layer 3: CLI command handlers
├── lib/                       # Layer 3: Configuration and utilities
└── index.ts                   # Layer 4: Composition root
```

## Layer 1: Entities

**Location:** `src/domain/entities/`

- MUST NOT import from any other layer
- MUST NOT depend on frameworks or infrastructure
- MUST NOT depend on global APIs (e.g., `crypto.randomUUID()`, `Date.now()`)
- MUST be plain TypeScript objects/classes with business logic
- MAY contain validation and business rules
- ID generation and timestamps should be passed as parameters or handled by use cases

```typescript
// src/entities/version-file.ts
export type VersionFileType = "node" | "python" | "java" | "ruby" | "go";

export interface VersionFile {
  readonly type: VersionFileType;
  readonly filename: string;
  readonly version?: string;
}

export interface DetectedEnvironment {
  readonly hasMise: boolean;
  readonly versionFiles: VersionFile[];
}

export function isValidVersionFileType(type: string): type is VersionFileType {
  return ["node", "python", "java", "ruby", "go"].includes(type);
}
```

**Violations:**
- Importing Zod, Prisma, or any framework
- Importing from `application/`, `adapters/`, or `infrastructure/`
- Database operations or HTTP calls
- Using global APIs like `crypto.randomUUID()` or `Date.now()`

## Layer 2: Use Cases

**Location:** `src/application/use-cases/`

- MUST only import from entities and ports (interfaces)
- MUST define input/output DTOs
- MUST define ports for external dependencies
- MUST NOT import concrete implementations

```typescript
// src/use-cases/parse-workflows.ts
import type { DetectedEnvironment, SetupStepCandidate } from '../entities/version-file';

export interface ParseWorkflowsInput { targetDir: string; }
export interface ParseWorkflowsOutput { candidates: SetupStepCandidate[]; }

// Ports - interfaces for dependencies
export interface WorkflowGateway {
  parseWorkflowsForSetupActions(targetDir: string): Promise<SetupStepCandidate[]>;
}

export interface EnvironmentGateway {
  detectEnvironment(targetDir: string): Promise<DetectedEnvironment>;
}

export class ParseWorkflowsUseCase {
  constructor(
    private readonly workflowGateway: WorkflowGateway,
    private readonly environmentGateway: EnvironmentGateway
  ) {}

  async execute(input: ParseWorkflowsInput): Promise<ParseWorkflowsOutput> {
    if (!input.targetDir) {
      throw new Error('Target directory is required');
    }

    const environment = await this.environmentGateway.detectEnvironment(input.targetDir);

    // Don't parse workflows if mise is detected (different strategy)
    if (environment.hasMise) {
      return { candidates: [] };
    }

    const candidates = await this.workflowGateway.parseWorkflowsForSetupActions(input.targetDir);
    return { candidates };
  }
}
```

**Violations:**
- Importing `yaml`, `citty`, or any framework
- Importing from `gateways/`, `commands/`, or `lib/`
- File system operations or HTTP calls

## Layer 3: Adapters

**Location:** `src/adapters/`

- MUST implement ports defined by use cases
- MAY import from entities and use cases
- MAY use framework-specific code
- MUST NOT contain business logic

```typescript
// src/gateways/file-system-workflow-gateway.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SetupStepCandidate } from '../entities/version-file';
import type { WorkflowGateway } from '../use-cases/parse-workflows';

export class FileSystemWorkflowGateway implements WorkflowGateway {
  async parseWorkflowsForSetupActions(targetDir: string): Promise<SetupStepCandidate[]> {
    const workflowsDir = join(targetDir, '.github', 'workflows');
    const files = await readdir(workflowsDir);
    const yamlFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    const candidates: SetupStepCandidate[] = [];

    for (const file of yamlFiles) {
      const content = await readFile(join(workflowsDir, file), 'utf-8');
      const workflow = parseYaml(content);

      // Extract setup actions from workflow steps
      const steps = this.extractStepsFromWorkflow(workflow);
      candidates.push(...steps);
    }

    return candidates;
  }

  private extractStepsFromWorkflow(workflow: unknown): SetupStepCandidate[] {
    // Implementation details...
    return [];
  }
}
```

```typescript
// src/commands/copilot-setup.ts
import { z } from 'zod';
import type { ParseWorkflowsUseCase } from '../use-cases/parse-workflows';
import { defineCommand } from 'citty';

const OptionsSchema = z.object({
  directory: z.string().default(process.cwd())
});

export function createCopilotSetupCommand(parseWorkflows: ParseWorkflowsUseCase) {
  return defineCommand({
    meta: {
      name: 'copilot-setup',
      description: 'Analyze project and generate Copilot setup steps'
    },
    args: {
      directory: {
        type: 'string',
        description: 'Target directory to analyze'
      }
    },
    async run({ args }) {
      const options = OptionsSchema.parse(args);
      const result = await parseWorkflows.execute({ targetDir: options.directory });
      console.log(`Found ${result.candidates.length} setup step candidates`);
      return result;
    }
  });
}
```

**Violations:**
- Business logic (validation rules, workflow filtering decisions)
- Domain decisions that should be in entities or use cases
- Complex parsing logic that belongs in use cases

## Layer 4: Infrastructure

**Location:** `src/infrastructure/`

- Composition root wires dependencies
- Framework configuration lives here
- MAY import from all layers

```typescript
// src/index.ts (composition root)
import { defineCommand, runMain } from 'citty';
import { ParseWorkflowsUseCase } from './use-cases/parse-workflows';
import { FileSystemWorkflowGateway } from './gateways/file-system-workflow-gateway';
import { FileSystemEnvironmentGateway } from './gateways/environment-gateway';
import { createCopilotSetupCommand } from './commands/copilot-setup';

export function createContainer() {
  // Wire up dependencies
  const workflowGateway = new FileSystemWorkflowGateway();
  const environmentGateway = new FileSystemEnvironmentGateway();
  const parseWorkflowsUseCase = new ParseWorkflowsUseCase(
    workflowGateway,
    environmentGateway
  );

  return {
    copilotSetupCommand: createCopilotSetupCommand(parseWorkflowsUseCase)
  };
}

// CLI entry point
const container = createContainer();
const main = defineCommand({
  meta: { name: 'lousy-agents' },
  subCommands: {
    'copilot-setup': container.copilotSetupCommand
  }
});

runMain(main);
```

## Import Rules Summary

| From | Entities | Use Cases | Gateways/Commands/Lib | Index (Root) |
|------|----------|-----------|----------------------|--------------|
| Entities | ✓ | ✗ | ✗ | ✗ |
| Use Cases | ✓ | ✓ | ✗ | ✗ |
| Gateways/Commands/Lib | ✓ | ✓ | ✓ | ✗ |
| Index (Root) | ✓ | ✓ | ✓ | ✓ |

## Anti-Patterns

**Anemic Domain Model:** Entities as data-only containers with logic in services. Put business rules in entities.

**Leaky Abstractions:** Ports exposing `yaml: string` or `FileHandle`. Use domain concepts only.

**Business Logic in Adapters:** File parsing decisions or validation rules in gateways. Move to entities/use cases.

**Framework Coupling:** Use cases accepting CLI `args` objects. Use plain DTOs.

## Code Review Checklist

- Entities have zero imports from other layers
- Use cases define ports for all external dependencies
- Adapters implement ports, contain no business logic
- Only composition root instantiates concrete implementations
- Use cases testable with simple mocks (no DB, no HTTP)
