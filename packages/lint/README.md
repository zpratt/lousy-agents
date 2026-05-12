# @lousy-agents/lint

Programmatic lint API for AI agent skill, agent, hook, and instruction files. Use this package to integrate lousy-agents lint checks into your own tools, web apps, or CI pipelines without the CLI.

For CLI-based linting, see the [`lint` command docs](https://github.com/zpratt/lousy-agents/blob/main/docs/lint.md).

## Installation

```bash
npm install @lousy-agents/lint
```

## Quick Start

```typescript
import { runLint } from '@lousy-agents/lint';

const result = await runLint({ directory: '/path/to/project' });

if (result.hasErrors) {
  console.error('Lint failed');
  for (const output of result.outputs) {
    for (const diagnostic of output.diagnostics) {
      console.error(`${diagnostic.filePath}:${diagnostic.line} [${diagnostic.severity}] ${diagnostic.message}`);
    }
  }
}
```

## API

### `runLint(options): Promise<LintResult>`

Runs all lint checks on a project directory and returns structured results.

```typescript
import { runLint, LintValidationError } from '@lousy-agents/lint';

try {
  const result = await runLint({
    directory: '/path/to/project',
    targets: {
      skills: true,
      agents: true,
      hooks: false,       // skip hook linting
      instructions: false, // skip instruction linting
    },
  });

  console.log('Has errors:', result.hasErrors);
  console.log('Outputs:', result.outputs.length);
} catch (error) {
  if (error instanceof LintValidationError) {
    console.error('Invalid input:', error.message);
  } else {
    throw error;
  }
}
```

**Options:**

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `directory` | `string` | ✅ | Absolute or relative path to the project directory to lint |
| `targets.skills` | `boolean` | — | Lint skill files (`.github/skills/`) |
| `targets.agents` | `boolean` | — | Lint agent files (`.github/agents/`) |
| `targets.hooks` | `boolean` | — | Lint hook configuration (`.claude/settings.json` / `hooks.json`) |
| `targets.instructions` | `boolean` | — | Lint instruction files (`.github/instructions/`, `.github/copilot-instructions.md`) |
| `logger` | `LintLogger` | — | Custom logger for gateway diagnostics (must have a `.warn` method); defaults to `consola` |

When `targets` is omitted or all flags are `false`, all targets are linted.

**Throws `LintValidationError`** when `directory` is empty, contains control characters, path traversal sequences, does not exist, or is not a directory.

---

### `createFormatter(format): LintFormatter`

Creates an output formatter for rendering `LintOutput[]` to a string.

```typescript
import { runLint, createFormatter } from '@lousy-agents/lint';

const result = await runLint({ directory: '/path/to/project' });
const formatter = createFormatter('human');
console.log(formatter.format(result.outputs));
```

| Format | Description |
| --- | --- |
| `'human'` | Human-readable text, one diagnostic per line |
| `'json'` | JSON array of all diagnostics |
| `'rdjsonl'` | [Reviewdog Diagnostic Format](https://github.com/reviewdog/reviewdog) JSONL (one JSON object per line) — for CI integrations |

---

### `DEFAULT_LINT_RULES`

The default rule configuration used when no `lousy-agents.config.ts` is present. Use this to inspect or extend the default rule set.

```typescript
import { DEFAULT_LINT_RULES } from '@lousy-agents/lint';

console.log(DEFAULT_LINT_RULES.skills);
// { 'skill/missing-name': 'error', 'skill/missing-description': 'error', ... }
```

---

### `LintValidationError`

Thrown when user-supplied input fails validation. Catch this to distinguish user-input errors from system errors.

```typescript
import { runLint, LintValidationError } from '@lousy-agents/lint';

try {
  await runLint({ directory: '' });
} catch (error) {
  if (error instanceof LintValidationError) {
    // directory was empty, missing, or not a directory
    console.error(error.message);
  }
}
```

---

## Types

```typescript
import type {
  LintResult,
  LintOutput,
  LintDiagnostic,
  LintSeverity,
  LintTarget,
  LintOptions,
  LintLogger,
  LintRulesConfig,
  LintFormatType,
  LintFormatter,
  InstructionQualityResult,
} from '@lousy-agents/lint';
```

**Key types:**

| Type | Description |
| --- | --- |
| `LintResult` | Top-level result: `outputs` array + `hasErrors` boolean |
| `LintOutput` | Per-target result: `diagnostics`, `filesAnalyzed`, `summary`, optional `qualityResult` |
| `LintDiagnostic` | Single diagnostic: `filePath`, `line`, `severity`, `message`, `ruleId`, `target` |
| `LintSeverity` | `"error" \| "warning" \| "info"` |
| `LintTarget` | `"skill" \| "agent" \| "instruction" \| "hook"` |
| `InstructionQualityResult` | Instruction quality scores and suggestions (populated when `instructions` target runs) |

---

## Custom Logger

Pass any object with a `.warn` method to suppress or redirect gateway diagnostics:

```typescript
import { runLint } from '@lousy-agents/lint';
import { createLogger } from 'your-logger';

const logger = createLogger('lint');
await runLint({
  directory: '/path/to/project',
  logger: { warn: (msg, ...args) => logger.warn(msg, ...args) },
});
```

---

## CI Integration (rdjsonl)

Output in Reviewdog Diagnostic Format for annotation-based CI feedback:

```bash
node -e "
const { runLint, createFormatter } = require('@lousy-agents/lint');
runLint({ directory: '.' }).then(r => {
  process.stdout.write(createFormatter('rdjsonl').format(r.outputs));
  process.exit(r.hasErrors ? 1 : 0);
});
"
```

---

## Related docs

- [`lint` CLI command](https://github.com/zpratt/lousy-agents/blob/main/docs/lint.md) — CLI-based linting with `npx @lousy-agents/cli lint`
- [GitHub Action](https://github.com/zpratt/lousy-agents/blob/main/docs/lint.md#github-action) — run linting in GitHub Actions without installing Node.js
