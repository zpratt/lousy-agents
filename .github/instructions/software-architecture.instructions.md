---
applyTo: "packages/*/src/**/*.{ts,tsx}"
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
packages/
├── core/src/
│   ├── entities/              # Layer 1: Business domain entities
│   ├── use-cases/             # Layer 2: Application business rules
│   ├── gateways/              # Layer 3: External system adapters
│   ├── lib/                   # Layer 3: Shared configuration and utilities
│   └── formatters/            # Layer 3: Output adapters
├── cli/src/
│   ├── commands/              # Layer 3: CLI command handlers
│   ├── lib/                   # Layer 3: CLI-specific helpers
│   └── index.ts               # Layer 4: CLI composition root
├── mcp/src/
│   ├── tools/                 # Layer 3: MCP tool handlers
│   ├── lib/                   # Layer 3: MCP-specific helpers
│   ├── server.ts              # Layer 4: MCP server setup
│   ├── mcp-server.ts          # Layer 4: MCP process entry point
│   └── index.ts               # Package API: re-exports createMcpServer
├── agent-shell/src/
│   ├── entities/              # Layer 1: Domain schemas and types
│   ├── use-cases/             # Layer 2: Command handlers and orchestration
│   ├── gateways/              # Layer 3: External system adapters (telemetry, git, filesystem)
│   ├── lib/                   # Layer 3: Shared utilities (sanitization, path validation)
│   └── index.ts               # Layer 4: Composition root
├── doctor/src/
│   ├── entities/              # Layer 1: Findings, criteria and inventory types
│   ├── use-cases/             # Layer 2: Classification and evaluation
│   ├── gateways/              # Layer 3: Repository scanning and evidence readers
│   ├── lib/                   # Layer 3: Parsing helpers
│   ├── formatters/            # Layer 3: Output adapters
│   ├── cli/                   # Layer 4: Standalone CLI composition root
│   └── index.ts               # Package API: what other packages import
├── lint/src/
│   ├── lint.ts                # Layer 4: Wires core gateways and use cases (the only file that may)
│   ├── index.ts               # Package API: re-exports, never imports core gateways, lib or use cases
│   ├── validate-directory.ts  # Input validation, never imports core gateways, lib or use cases
│   └── lint-errors.ts         # Error types, imports no other lint file
└── action/src/
    ├── index.ts               # Layer 4: GitHub Action entry and wiring
    ├── run-lint.ts            # Layer 3: Runs lint for the Action
    └── validate-inputs.ts     # Layer 3: Reads and validates Action inputs
```

## Layer 1: Entities

**Location:** `packages/core/src/entities/`

- MUST NOT import from any other layer
- MUST NOT depend on frameworks or infrastructure
- MUST NOT depend on global APIs (e.g., `crypto.randomUUID()`, `Date.now()`)
- MUST be plain TypeScript objects/classes with business logic
- MAY contain validation and business rules
- ID generation and timestamps should be passed as parameters or handled by use cases

```typescript
// packages/core/src/entities/version-file.ts
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
- Importing from `packages/core/src/use-cases/`, `packages/core/src/gateways/`, `packages/cli/src/commands/`, or `packages/core/src/lib/`
- Database operations or HTTP calls
- Using global APIs like `crypto.randomUUID()` or `Date.now()`

## Layer 2: Use Cases

**Location:** `packages/core/src/use-cases/`

- MUST only import from entities and ports (interfaces)
- MUST define input/output DTOs
- MUST define ports for external dependencies
- MUST NOT import concrete implementations

```typescript
// packages/core/src/use-cases/parse-workflows.ts
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

**Location:** `packages/core/src/gateways/`, `packages/core/src/lib/`, `packages/cli/src/commands/`, and `packages/mcp/src/tools/`

- MUST implement ports defined by use cases
- MAY import from entities and use cases
- MAY use framework-specific code
- MUST NOT contain business logic

### Class-Based Adapters with Constructor Injection

```typescript
// packages/core/src/gateways/file-system-workflow-gateway.ts
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
// packages/core/src/gateways/action-version-gateway.ts
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
// packages/cli/src/commands/copilot-setup.ts
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

**Location:** `packages/cli/src/index.ts` and `packages/mcp/src/mcp-server.ts` (composition roots)

- Composition root wires dependencies
- Framework configuration lives here
- MAY import from all layers

```typescript
// packages/cli/src/index.ts (composition root)
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
| ------ | ---------- | ----------- | ---------------------- | -------------- |
| Entities | ✓ | ✗ | ✗ | ✗ |
| Use Cases | ✓ | ✓ | ✗ | ✗ |
| Gateways/Commands/Lib | ✓ | ✓ | ✓ | ✗ |
| Index (Root) | ✓ | ✓ | ✓ | ✓ |

## Enforcement

`.lousy-agents/coach.json` states these rules for coach: which directories and files belong to which layer, and which layers must not import which. `mise run architecture` (part of `mise run lint`) fails on any `architecture.layer_violation` coach reports in the committed code, whether new or already there, when any file coach analyzed sits outside every declared layer (coach checks no import to or from such a file), when coach reports incomplete coverage (exit 3), and unless `coach --version` prints exactly the release `mise.toml` pins (0.12.0). A specifier that is not a string literal is reported by coach as a `project_import_non_literal` diagnostic and does not fail the gate (see the table below). Of the findings coach reports, only the rule id `architecture.layer_violation`, matched exactly, fails the build. A rule coach adds later, including any other `architecture.*` rule, stays advisory until the gate names it. The file-local rules (cognitive complexity, nesting, branch density) stay advisory too.

Coach reads committed Git objects, so commit before you run the gate. When there are uncommitted changes under `packages/`, the gate prints a notice on stderr that coach analyzed `HEAD` only and names the first few changed files. The notice is informational and never changes the exit code. `mise run coach-worktree` scans uncommitted changes before you commit (advisory; coach's experimental `--worktree` mode, which still reads the policy from `HEAD`).

The layers in `.lousy-agents/coach.json` are:

| Layer | What it holds | Must not import |
| ----- | ------------- | --------------- |
| `entities` | `entities/` in core, agent-shell and doctor | use cases, adapters, formatters, composition roots, package APIs, lint's own files, core's barrel |
| `use_cases` | `use-cases/` in the same packages | adapters, formatters, composition roots, package APIs, lint's own files, core's barrel |
| `adapters` | `gateways/`, `lib/`, CLI `commands/`, MCP `tools/`, the Action's `run-lint.ts` and `validate-inputs.ts`, agent-shell's `types/copilot-sdk.d.ts` | composition roots, core's barrel, lint's `validate-directory.ts` and `lint-errors.ts` (use lint's package API) |
| `formatters` | `formatters/` in core and doctor | composition roots, core's barrel, lint's `validate-directory.ts` and `lint-errors.ts` (use lint's package API) |
| `composition_root` | Each package's wiring: `index.ts` in cli, agent-shell and the Action, MCP `server.ts` and `mcp-server.ts`, doctor `cli/`, lint's `lint.ts` | (may import anything) |
| `package_api` | Barrels other packages import: doctor and MCP `index.ts` | (may import anything) |
| `core_barrel` | Core's `index.ts`, an empty barrel. Entities, use cases, adapters and formatters may not import it; import core modules by subpath | (may import anything) |
| `lint_api`, `lint_validate_directory`, `lint_errors` | Lint's `index.ts`, `validate-directory.ts` and `lint-errors.ts` | core gateways, lib or use cases; `lint_api` also not `validate-directory.ts`; `lint_errors` also not any other lint file |
| `scaffold_templates` | The template projects the CLI writes for users: `packages/cli/api`, `packages/cli/cli`, `packages/cli/ui` | any other layer. No other layer may import a template either, so a template stays self-contained |
| `tooling` | The architecture gate under `scripts/`, the semgrep fixtures, and the root and package `vitest`/`rspack` configs | (not restricted). No production layer and no template may import it |

Add every new production file under `packages/*/src` to a layer. A test fails when a file belongs to none, to two, or when a prefix is nested inside another or matches no tracked TypeScript file, because coach says nothing about a file that no layer claims. The gate also fails when coach's own count of analyzed files outside every layer is above zero, which covers files outside `packages/*/src` that coach reads through a `tsconfig.json`.

### What checks what

The layer rules cover imports between this repository's own files. The table says which tool covers each kind of import, and what nothing covers:

| Import | Checked by |
| ------ | ---------- |
| Between repository files, written as a value, as `import type`, `export type … from`, an import or re-export whose every binding is an inline `type`, or as a string-literal `import()` or `require()` | `mise run architecture` (coach 0.12.0, which reads imports through tsc) |
| Import cycles, including cycles made only of types, a package imported but not declared in the importing package's `package.json`, deprecated Node core modules | Biome (`noImportCycles`, `noUndeclaredDependencies`, `noRestrictedImports`) in `mise run lint`. Tests and tool configuration may use the root's tooling |
| An import that does not resolve | `mise run typecheck` (tsc) |
| A production source file saved as UTF-16 (tsc reads it, coach does not: [lousy-agents/coach#585](https://github.com/lousy-agents/coach/issues/585)), or with a UTF-8 byte-order mark (coach reads it; rejected for uniformity) | `scripts/architecture-gate/production-source-encoding.test.ts`, in `mise run test` |
| A `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` or `.jsx` file under `packages/*/src`, which coach 0.12.0 does not analyze while tsc and Biome accept it | `scripts/architecture-gate/project-policy.test.ts`, in `mise run test`. Write the file as `.ts` or `.tsx` |
| Any triple-slash reference directive (`/// <reference …>`, `types` and `lib` included) in a source file under `packages/*/src`: a `path` one pulls a file in as an import does, and coach does not count it | `scripts/architecture-gate/production-source-references.test.ts`, in `mise run test` |
| An npm package or `node:` module, such as a use case importing `node:fs` or a framework | Nothing. The layer rules do not look at them, so the rules above about frameworks and global APIs are enforced by review |
| `typeof import("x")` or `import("x").Type` in a type position | Nothing. Coach 0.12.0 does not count them ([lousy-agents/coach#591](https://github.com/lousy-agents/coach/issues/591)), and no production file uses one. A reviewer sees an `import(` where a type belongs |
| `import(path)` or `require(name)` with a specifier that is not a string literal | Nothing fails. Coach cannot read it statically and reports a `project_import_non_literal` diagnostic, so the layer verdict for that file is incomplete, but the run still exits 0 |
| Anything in tests, and `packages/lint/src/index.d.ts`, which coach does not analyze | Nothing |

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
