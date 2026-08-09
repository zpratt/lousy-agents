# TypeScript adapter and catalogue

Load this file only when `metadata.language` is `ts`. This is the authoritative TypeScript adapter and the ten concrete mutation types. Preserve existing TypeScript path behavior.

## Adapter

- **Package root:** nearest directory to the discovery roots that contains `package.json` (workspace root for pure TS apps; a nested package dir in monorepos).
- **Baseline/test command:** from the package root, `nvm use && npm test` when `nvm` and `.nvmrc` apply; otherwise `npm test`. If the monorepo pins Node via mise/asdf, ensure that Node is active before `npm test`. Do not run `npm test` from a parent that lacks this package's `package.json`.
- **Discovery (default, no `--target`)** — unchanged pure-TS layout:

  ```bash
  find src -name "*.ts" ! -name "*.d.ts" ! -name "*.test.ts" ! -name "index.ts" | sort
  ```

  Paths are relative to the package root when the package root is the workspace; when hunting a nested package via `--lang ts --target ...`, expand `--target` instead of assuming workspace-level `src/`.

- **When `--target` is set:** expand the glob from the workspace root, then apply exclusions. Use this for monorepos where sources are not at workspace `src/` (e.g. `js/semantics/src/**/*.ts`).
- **Priority folders:** `src/entities/`, `src/use-cases/`, `src/gateways/`, and `src/lib/` (under the package root). When those Clean-Architecture folders are absent, favour non-test modules with real control flow over thin barrels.
- **Exclusions:** `*.d.ts`, `*.test.ts`, `index.ts`, pure type-definition files, the composition root `src/index.ts`, `node_modules/`, `dist/`, and build output.
- **Empty discovery:** if default `src/` is missing and `--target` was not provided, abort and tell the user to pass `--target` (and `--lang ts` in polyglot repos).
- **Compile errors:** TypeScript compile errors, including `tsc` failures reported by the test command, count as killed.
- **Default `--target`:** `src/**/*.ts` excluding `*.d.ts`, `*.test.ts`, and `index.ts`.

## TypeScript-only catalogue (10 types)

Apply these in addition to the shared catalogue in `SKILL.md`. Keep examples and behavior compatible with the existing TypeScript path.

### 1. Comparison Operator Mutations

Change relational operators to probe boundary conditions:

| Original | Mutated | Rationale |
|:---|:---|:---|
| `> n` | `>= n` | Weakens strict lower bound |
| `< n` | `<= n` | Weakens strict upper bound |
| `>= n` | `> n` | Strengthens lower bound (off-by-one) |
| `<= n` | `< n` | Strengthens upper bound (off-by-one) |
| `=== x` | `!== x` | Inverts equality check |
| `!== x` | `=== x` | Inverts inequality check |

**Example:**

```typescript
// Original
if (size > MAX_SIZE) { throw new Error("Too large"); }

// Mutated
if (size >= MAX_SIZE) { throw new Error("Too large"); }
```

### 2. Logical Operator Mutations

Replace logical connectives to expose missing compound-condition tests:

| Original | Mutated |
|:---|:---|
| `&&` | `\|\|` |
| `\|\|` | `&&` |

**Example:**

```typescript
// Original
if (name && name.length > 0) { ... }

// Mutated
if (name || name.length > 0) { ... }
```

### 3. Boolean Literal Mutations

Negate boolean constants:

| Original | Mutated |
|:---|:---|
| `true` | `false` |
| `false` | `true` |

Only apply to boolean literals that are **used as values** (not as flags in control flow already covered by other mutation types).

### 4. Arithmetic Operator Mutations

Swap arithmetic operators to expose miscalculation tests:

| Original | Mutated |
|:---|:---|
| `a + b` | `a - b` |
| `a - b` | `a + b` |
| `a * b` | `a / b` |
| `a / b` | `a * b` |

Only apply where both operands are numeric and the expression result is used meaningfully (not inside a template literal for display only).

### 5. Return Value Mutations

Replace a function's return value with a type-compatible empty/zero value:

| Return type | Original | Mutated |
|:---|:---|:---|
| `string` | `return computedString` | `return ""` |
| `number` | `return computedNumber` | `return 0` |
| `boolean` | `return expr` | `return false` |
| `array` | `return computedArray` | `return []` |
| `object` | `return computedObject` | `return {} as typeof computedObject` |

**Example:**

```typescript
// Original
return statements.sort();

// Mutated
return [];
```

### 6. Null-Guard / Early-Return Removal

Remove a defensive early-return to see whether callers handle `undefined`/`null` responses:

```typescript
// Original
if (!input) { return undefined; }

// Mutated — remove the guard entirely (or return without the check)
```

Only apply when the early-return protects against an invalid state. Do not apply to error-throwing guards (those are tested differently).

### 7. Off-by-One Index Mutations

Shift array/string indices by ±1:

| Original | Mutated |
|:---|:---|
| `arr[i]` | `arr[i + 1]` |
| `arr[i]` | `arr[i - 1]` |
| `.slice(0, n)` | `.slice(0, n - 1)` |
| `.slice(0, n)` | `.slice(0, n + 1)` |

### 8. Nullish / Optional-Chaining Mutations

Remove nullish coalescing or optional chaining:

| Original | Mutated |
|:---|:---|
| `value ?? defaultValue` | `value` (removes fallback) |
| `obj?.prop` | `obj.prop` (removes guard) |

### 9. Object Property Mutations

Swap or omit an object property in a literal or spread to expose missing property assertions:

```typescript
// Original
return { name: input.name, version: input.version };

// Mutated
return { name: input.name, version: "" };
```

### 10. Conditional Inversion

Negate the entire condition of an `if` statement:

```typescript
// Original
if (isValid(x)) { process(x); }

// Mutated
if (!isValid(x)) { process(x); }
```
