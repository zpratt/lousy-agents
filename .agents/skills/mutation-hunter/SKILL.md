---
name: mutation-hunter
description: Uncover test coverage gaps by applying semantic mutations to production TypeScript, Go, or Python code and identifying which mutations survive (tests still pass). Use when hunting mutants, validating test coverage, or finding behavioral gaps; surviving mutations indicate areas where tests are insufficient.
argument-hint: "<mutations> — number of mutations to hunt (e.g., 10). Optionally scope to files with --target <glob>. Use --lang ts|go|python to override deterministic language detection; defaults are language-aware."
allowed-tools: "read_file, edit_file, run_in_terminal, list_directory_contents, create_file"
---

# Mutation Hunter

You are a mutation testing agent. Your job is to find **surviving mutations** — semantic changes to production code that do not cause any tests to fail. Each surviving mutation is evidence of a test coverage gap.

## When to Use

Use this skill when a user asks to:

- Run mutation testing or hunt surviving mutants
- Validate behavioral test coverage in TypeScript, Go, or Python production code
- Find tests that would miss a regression

Do **not** use this skill when:

- The user wants new tests written from scratch without a mutation hunt (write tests directly, or use a test-authoring skill)
- The user only wants to run the existing test suite
- The user wants load, performance, or security fuzzing rather than semantic mutation testing
- The target language is not TypeScript, Go, or Python
- An external tool (Stryker, mutmut, go-mutesting, etc.) would replace the agent-owned apply → test → classify → always-revert loop — those tools may assist candidate discovery only

## Inputs

| Argument | Required | Description |
|:---|:---|:---|
| `mutations` | Yes | Number of mutations to attempt (e.g., `10`) |
| `--target` | No | Glob pattern for source files. Defaults are language-aware; see the selected adapter in `./references/`. |
| `--lang` | No | Explicit language override: `ts`, `go`, or `python`. If omitted, use the deterministic selection rules below. |

## Language Selection

Select one language once before Step 1 and use that adapter for the entire run. Evaluate markers relative to the **workspace root** (current working directory for the hunt), not nested package folders, unless `--target` confines the hunt to a subtree (see Workspace roots). The first matching rule wins, in this exact order:

1. An explicit `--lang ts`, `--lang go`, or `--lang python` flag.
2. The presence of `go.mod` at the workspace root selects `go`.
3. The presence of `package.json` at the workspace root plus either root `tsconfig.json` or any `.ts`/`.tsx` source under the workspace selects `ts`.
4. The presence of root `pyproject.toml`, `setup.py`, `setup.cfg`, or any root `requirements*.txt` selects `python`.
5. Otherwise, count supported source-file extensions under the target directory (or workspace root) and select the majority: `.ts`/`.tsx` → `ts`, `.go` → `go`, `.py` → `python`.

An explicit unsupported `--lang` value is an input error. Conflicting project markers are not guessed at: precedence above resolves them deterministically, and the selected language is recorded in `metadata.language`. If extension counts tie, use the fixed order `ts`, then `go`, then `python`; if no supported source extension exists, stop with a clear language-detection error. A marker-based selection always takes precedence over extension counts.

Nested language trees inside a polyglot monorepo (for example a `js/` package inside a Go module) do **not** override root detection. To hunt that nested tree, pass both `--lang` and `--target` (for example `--lang ts --target 'js/semantics/src/**/*.ts'`).

After selection, **read only the matching adapter file** (one level deep):

| Language | Adapter + catalogue |
|:---|:---|
| `ts` | `./references/typescript.md` |
| `go` | `./references/go.md` |
| `python` | `./references/python.md` |

The adapter is a small internal concept in this skill, not a runtime plugin system. It is the single source of truth for baseline/test command, discovery, exclusions, priority paths, language-only mutations, return zero-values, and compile/syntax kill rules.

## Workspace roots and toolchains

Resolve a **language package root** before baseline:

| Language | Package root |
|:---|:---|
| `go` | Directory of the controlling `go.mod` (walk up from workspace root / `--target` hits). |
| `ts` | Nearest directory to the discovery roots that contains `package.json` (and usually `tsconfig.json`). Pure TS apps keep the workspace root when `package.json` lives there. Nested monorepo packages (e.g. `js/semantics/`) use that package directory as cwd for `npm test`. |
| `python` | Directory of the controlling `pyproject.toml` / `setup.py` / `setup.cfg` / requirements file, else the workspace root. |

Run adapter baseline/test commands with cwd = package root. Prefer the project's pinned toolchain when present so binaries resolve correctly:

- If `mise.toml` / `.tool-versions` / similar exists, invoke via that manager (e.g. `mise exec -- go test ./...`, `mise exec -- npm test`) or ensure the pinned `go`/`node`/`python` is on `PATH` before running bare commands.
- TypeScript may still wrap with `nvm use` when `.nvmrc` exists and `nvm` is available.
- Do not invent alternate test scripts; only ensure the adapter's command can run under the repo's version pins.

## Workflow

### Step 1 — Pre-flight baseline

Ensure all tests pass before starting. If the baseline fails, abort and report the failure.

Run the selected adapter's baseline command from its reference file, at the language package root, using the resolved toolchain.

> If tests fail, output:
> ```json
> { "error": "Baseline test run failed. Fix failing tests before running mutation-hunter.", "details": "<test output>" }
> ```
> Then stop. Do not proceed with mutations on a broken baseline.

### Step 2 — Discover mutation targets

If `--target` is set, expand that glob from the workspace root and keep only paths that pass the selected adapter's exclusions (tests, generated, fixtures, `testdata`, vendor/venv, etc.).  
If `--target` is omitted, use the adapter's default discovery command and exclusions.

Apply the adapter's priority paths when ranking candidates. Skip files that are purely type definitions or otherwise have no executable code.

If the candidate set is empty, abort with a clear error (for TypeScript defaults, mention that `src/` is required unless `--target` points at the real sources). Do not invent paths.

### Step 3 — Select mutation candidates

For each candidate file, read it and identify mutatable constructs from the **shared catalogue** below plus the **language-only catalogue** in the selected adapter reference. Build an internal list of `(file, line, mutation-type, original, mutated)` tuples. Select from this list randomly until you have reached the requested `mutations` count, favouring files with more complex logic and the adapter's priority paths.

### Step 4 — Hunt loop

For each mutation in your selection:

1. **Record** the original source of the target line (exact bytes).
2. **Apply** the mutation by editing the file (make the smallest possible change to a single construct).
3. **Run tests** with the selected adapter's test command at the language package root (same command as baseline). Do not narrow the suite to a single package unless the adapter explicitly allows it — narrower suites can false-survive mutants only covered by other packages.
4. **Classify** the result:
   - Tests **fail** — the mutation was **killed** (tests caught the change).
   - Tests **pass** — the mutation **survived** (test gap found).
   - Compile/syntax failures defined by the adapter also count as **killed**.
5. **Revert** the mutation immediately by restoring the original bytes — never leave the code in a mutated state. After revert, confirm the file matches the recorded original (e.g. re-read or `git diff` that path is clean relative to pre-mutation content).
6. Log the result internally and continue.

> **Important:** Always revert before moving to the next mutation, even if the test runner crashes or times out. The codebase must be identical to the baseline when you finish. A failed revert stops the run and reports the affected file.

### Step 5 — Produce output

Write the final JSON report to stdout. Format is described in the **Output Format** section below.

## Shared Mutation Catalogue

Apply **one mutation at a time** — never combine multiple changes in a single trial. Each mutation must be semantically meaningful (changes program behavior) rather than purely syntactic.

1. **Comparison / relational boundary and negation** — mutate `>`, `>=`, `<`, `<=`, equality, or inequality while preserving the language's syntax.
2. **Logical operators** — mutate `&&`/`||` in TypeScript and Go, or `and`/`or` in Python.
3. **Boolean literal flip** — mutate a boolean literal used as a value.
4. **Arithmetic operators** — mutate `+`/`-` or `*`/`/` where operands are numeric and the result is meaningful.
5. **Return value** — replace a result with the language-appropriate zero, empty, nil, `None`, or false value (see adapter).
6. **Early-return / null-guard / error-guard removal** — remove a defensive guard when it protects an invalid state; do not remove an error-throwing guard indiscriminately.
7. **Off-by-one** — shift an index or slice/length boundary by ±1.
8. **Conditional inversion** — negate the complete condition while preserving language syntax.

Language-specific operators, examples, and extra constructs live only in the selected `./references/` adapter file. Do not invent a second copy of those lists here.

## Output Format

Produce a single JSON object with the following schema. Write it to stdout.

```json
{
    "metadata": {
        "target": "src/",
        "language": "ts",
        "mutations_requested": 10,
        "timestamp": "<ISO-8601>"
    },
    "summary": {
        "files_analyzed": 5,
        "mutations_attempted": 10,
        "mutations_killed": 7,
        "mutations_survived": 3,
        "survival_rate": 0.3,
        "coverage_grade": "C"
    },
    "surviving_mutations": [
        {
            "id": "mut-001",
            "file": "src/use-cases/build-permission-policy.ts",
            "line": 42,
            "mutation_type": "comparison_operator",
            "original_code": "if (size > MAX_SIZE) {",
            "mutated_code": "if (size >= MAX_SIZE) {",
            "description": "Boundary condition weakened: `>` changed to `>=`",
            "coverage_gap": "No test exercises the exact boundary where size equals MAX_SIZE.",
            "advice": "Add a test case that produces a policy with size exactly equal to MAX_SIZE and assert that the function does NOT throw. Then add a second test at MAX_SIZE + 1 and assert that it DOES throw. This will pin down the inclusive/exclusive boundary."
        }
    ],
    "killed_mutations": [
        {
            "id": "mut-002",
            "file": "src/entities/policy-document.ts",
            "line": 10,
            "mutation_type": "boolean_literal",
            "original_code": "Effect: \"Allow\"",
            "mutated_code": "Effect: \"Deny\"",
            "description": "Effect field changed from Allow to Deny",
            "killed_by_test": "src/use-cases/build-permission-policy.test.ts"
        }
    ]
}
```

### Coverage Grade

Derive `coverage_grade` from `survival_rate` (surviving / attempted):

| Survival rate | Grade | Interpretation |
|:---|:---|:---|
| 0% | A | Excellent — tests killed every mutation |
| 1–10% | B | Good — minor gaps |
| 11–25% | C | Acceptable — some gaps worth addressing |
| 26–50% | D | Weak — significant test coverage gaps |
| > 50% | F | Poor — tests are insufficient to catch most regressions |

The `metadata.language` value must be exactly `ts`, `go`, or `python`. Keep every other report field and array shape unchanged.

## Advice Generation Guidelines

For each surviving mutation, generate `advice` that is:

1. **Specific** — reference the exact line and condition that survived, not generic advice like "add more tests".
2. **Actionable** — describe the exact input value or scenario that would kill the mutation (a test with `x === boundary` is better than "test the boundary").
3. **Contextual** — if the surviving mutation is in a validation function, the advice should mention testing the invalid input that should have been rejected.
4. **Minimal** — suggest the fewest tests needed to kill the mutation, not an exhaustive suite.

## Error Handling

| Situation | Action |
|:---|:---|
| Unsupported explicit language or no detectable language | Abort immediately with a clear input error; do not mutate |
| Empty discovery (no eligible source files) | Abort immediately with a clear error; do not mutate |
| Nested language tree without `--lang`/`--target` in a polyglot repo | Do not guess; root detection wins, or require explicit `--lang` + `--target` |
| Baseline tests fail | Abort immediately, output error JSON, do not mutate |
| Toolchain binary missing (`go`/`npm`/`pytest` not on PATH) | Resolve via project pin (mise/asdf/nvm) or abort with install/pin guidance; do not skip baseline |
| Adapter-defined compile/syntax error (TS/`go test`/Python) | Count as "killed", revert, continue |
| Test runner hangs > 60s | Kill the process, count as "killed" (timeout = detectable failure), revert, continue |
| File cannot be edited | Skip the mutation, log a warning in metadata |
| Revert fails | **Stop immediately**, report the partially-mutated file as an error so the user can restore it manually |

External mutation tools are not required. They may be used only for optional candidate discovery; the agent owns mutation application, one-at-a-time classification, reversion, and advice generation.

## Constraints

- **Never** leave the codebase in a mutated state when finished.
- **Never** apply more than one mutation at a time.
- Work in small, atomic changes — single-line edits preferred.
- Prefer mutations in business logic and the adapter's priority paths over composition roots, commands, or gateways.
- Never mutate test files, fixtures, generated files, migrations, pure type-definition files, or other adapter exclusions (see the selected `./references/` file).
- Keep TypeScript defaults, discovery, priority folders, exclusions, ten mutation types, examples, and test behavior compatible with the existing TypeScript path in `./references/typescript.md`.
