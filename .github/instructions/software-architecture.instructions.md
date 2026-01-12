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
├── mcp/                       # Layer 3: MCP protocol adapters
│   ├── tools/                 # Individual MCP tool handlers
│   ├── server.ts              # MCP server setup and tool registration
│   └── index.ts               # MCP module exports
├── lib/                       # Layer 3: Configuration and utilities
├── index.ts                   # Layer 4: Composition root (CLI)
└── mcp-server.ts              # Layer 4: Composition root (MCP server)
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
- Importing from `src/use-cases/`, `src/gateways/`, `src/commands/`, or `src/lib/`
- Database operations or HTTP calls
- Using global APIs like `crypto.randomUUID()` or `Date.now()`

## Layer 2: Use Cases

**Location:** `src/use-cases/`

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

**Location:** `src/gateways/`, `src/commands/`, and `src/lib/`

- MUST implement ports defined by use cases
- MAY import from entities and use cases
- MAY use framework-specific code
- MUST NOT contain business logic

### Class-Based Adapters with Constructor Injection

```typescript
// src/gateways/file-system-workflow-gateway.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ConsolaInstance } from 'consola';
import type { SetupStepCandidate } from '../entities/version-file';
import type { WorkflowGateway } from '../use-cases/parse-workflows';

// Use constructor injection for all dependencies
export class FileSystemWorkflowGateway implements WorkflowGateway {
  constructor(private readonly logger: ConsolaInstance) {}

  async parseWorkflowsForSetupActions(targetDir: string): Promise<SetupStepCandidate[]> {
    this.logger.debug('Parsing workflows in directory:', targetDir);
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

    this.logger.info(`Found ${candidates.length} setup step candidates`);
    return candidates;
  }

  private extractStepsFromWorkflow(workflow: unknown): SetupStepCandidate[] {
    // Implementation details...
    return [];
  }
}
```

### Factory Function Pattern (Alternative)

Factory functions are an alternative to class-based adapters. They're useful for simpler adapters or when you prefer functional composition.

```typescript
// src/gateways/action-version-gateway.ts
import type { ConsolaInstance } from 'consola';
import { z } from 'zod';

export interface ActionVersionGateway {
  getVersion(action: string): Promise<string>;
}

const GitHubReleaseSchema = z.object({
  tag_name: z.string()
});

// Factory function that returns an object implementing the port
export function createActionVersionGateway(
  logger: ConsolaInstance,
  baseUrl = 'https://api.github.com'
): ActionVersionGateway {
  return {
    async getVersion(action: string): Promise<string> {
      logger.debug('Fetching version for action:', action);
      const [owner, repo] = action.split('/');
      const response = await fetch(`${baseUrl}/repos/${owner}/${repo}/releases/latest`);

      if (!response.ok) {
        throw new Error(`Failed to fetch version for ${action}: ${response.status}`);
      }

      const data: unknown = await response.json();
      const release = GitHubReleaseSchema.parse(data);
      return release.tag_name;
    }
  };
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

**Location:** `src/index.ts` (composition root)

- Composition root wires dependencies
- Framework configuration lives here
- MAY import from all layers

```typescript
// src/index.ts (composition root)
import { defineCommand, runMain } from 'citty';
import { createConsola } from 'consola';
import { ParseWorkflowsUseCase } from './use-cases/parse-workflows';
import { FileSystemWorkflowGateway } from './gateways/file-system-workflow-gateway';
import { FileSystemEnvironmentGateway } from './gateways/environment-gateway';
import { createActionVersionGateway } from './gateways/action-version-gateway';
import { createCopilotSetupCommand } from './commands/copilot-setup';

export function createContainer() {
  // Create shared dependencies
  const logger = createConsola({ level: 3 });

  // Wire up dependencies using constructor injection for classes
  const workflowGateway = new FileSystemWorkflowGateway(logger);
  const environmentGateway = new FileSystemEnvironmentGateway(logger);

  // Wire up dependencies using factory functions
  const actionVersionGateway = createActionVersionGateway(logger);

  // Inject all dependencies into use cases
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

## Dependency Injection Patterns

### Constructor Injection (Preferred)

Always use constructor injection for dependencies. This makes dependencies explicit and enables easy testing.

```typescript
// ✅ Good - Constructor injection
export class FileSystemWorkflowGateway implements WorkflowGateway {
  constructor(
    private readonly logger: ConsolaInstance,
    private readonly config: Config
  ) {}

  async parseWorkflows(dir: string): Promise<SetupStepCandidate[]> {
    this.logger.debug('Parsing workflows');
    // ...
  }
}

// ❌ Bad - No dependency injection (hard to test, tightly coupled)
export class FileSystemWorkflowGateway implements WorkflowGateway {
  async parseWorkflows(dir: string): Promise<SetupStepCandidate[]> {
    console.log('Parsing workflows'); // Direct coupling to console
    // ...
  }
}
```

### Factory Functions

Factory functions are an alternative pattern that returns objects implementing ports. Useful for simpler adapters.

```typescript
// Factory function with dependency injection
export function createActionVersionGateway(
  logger: ConsolaInstance
): ActionVersionGateway {
  return {
    async getVersion(action: string): Promise<string> {
      logger.debug('Fetching version for:', action);
      // Implementation...
      return 'v1.0.0';
    }
  };
}

// In composition root:
const logger = createConsola();
const gateway = createActionVersionGateway(logger);
```

### Choosing Between Patterns

- **Use classes with constructor injection** when:
  - The adapter has multiple methods
  - You need private helper methods
  - State management is needed

- **Use factory functions** when:
  - The adapter is simple (1-2 methods)
  - You prefer functional composition
  - You want to avoid `this` keyword complexity

Both patterns achieve the same goal: explicit dependency injection and testability.

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
