# `lint` Command

Validates agent skills, custom agents, and instruction files. Discovers lint targets in the repository, checks YAML frontmatter and instruction quality, and reports diagnostics with line numbers.

## Features

- **Unified Linting**: Lint skills, agents, and instruction files through a single command
- **Automatic Discovery**: Finds targets across `.github/skills/`, `.github/agents/`, and instruction file locations
- **Frontmatter Validation**: Checks for required fields and validates their format
- **Instruction Quality Analysis**: Scores feedback loop documentation across three dimensions (structural context, execution clarity, loop completeness)
- **Line-Level Diagnostics**: Reports errors and warnings with exact line numbers
- **Multiple Output Formats**: Human-readable (default), JSON, and reviewdog-compatible JSON Lines
- **Configurable Rules**: Customize rule severity per-project via `lousy-agents.config.ts`
- **Exit Codes**: Returns non-zero exit code when errors are found, enabling CI integration

## Configuration

The lint command supports per-rule severity configuration through a `lousy-agents.config.ts` file (or any [c12-supported format](https://github.com/unjs/c12#readme)) placed in your project root.

### Configuration File

Create a configuration file in your project root:

```typescript
// lousy-agents.config.ts
export default {
  lint: {
    rules: {
      agents: {
        "agent/invalid-name-format": "warn",
        "agent/name-mismatch": "off",
      },
      instructions: {
        "instruction/command-outside-section": "off",
      },
      skills: {
        "skill/missing-allowed-tools": "error",
      },
    },
  },
};
```

### Severity Levels

| Severity | Behavior |
|----------|----------|
| `"error"` | Emits an error diagnostic and causes a non-zero exit code |
| `"warn"` | Emits a warning diagnostic but does not affect the exit code |
| `"off"` | Suppresses the diagnostic entirely |

### Default Behavior

When no configuration file is found, or when a rule is not specified in the configuration, the lint command uses the default severity for each rule. Defaults match the current hardcoded behavior:

- **Agent rules**: All default to `"error"` except `agent/invalid-field` which defaults to `"warn"`
- **Instruction rules**: All default to `"warn"`
- **Skill rules**: All default to `"error"` except `skill/missing-allowed-tools` which defaults to `"warn"`

### Configuration File Formats

The configuration is loaded using [c12](https://github.com/unjs/c12) with the name `lousy-agents`. Supported formats include:

- `lousy-agents.config.ts`
- `lousy-agents.config.mjs`
- `lousy-agents.config.js`
- `.lousy-agentsrc.json`
- `.lousy-agentsrc.yaml`

> **Security note**: Configuration files (`.ts`, `.mjs`, `.js`) execute code at load time. Treat them with the same rigor as source code. The lint command only loads configuration from the target directory being linted.

## Usage

### Basic Usage

Run from your project root to lint everything (skills, agents, and instructions):

```bash
npx @lousy-agents/cli lint
```

When no target flags are provided, the command runs all three linters.

### Target Flags

Use flags to lint specific targets:

| Flag | Description |
|------|-------------|
| `--skills` | Lint skill frontmatter in `.github/skills/` |
| `--agents` | Lint agent frontmatter in `.github/agents/` |
| `--instructions` | Analyze instruction quality across all instruction file formats |
| `--format <type>` | Output format: `human` (default), `json`, or `rdjsonl` |

```bash
# Lint only skills
npx @lousy-agents/cli lint --skills

# Lint only agents
npx @lousy-agents/cli lint --agents

# Analyze only instruction quality
npx @lousy-agents/cli lint --instructions

# Lint everything (same as no flags)
npx @lousy-agents/cli lint
```

---

## Skill Linting (`--skills`)

Validates YAML frontmatter in `.github/skills/*/SKILL.md` files.

### What It Validates

**Required fields** (errors if missing):

- `name` — Skill name (must be lowercase with hyphens, matching directory name)
- `description` — Brief description of what the skill does

**Format rules**:

- Name must be lowercase with hyphens (e.g., `github-actions-debug`)
- Name should match the skill's directory name
- YAML frontmatter must be present and valid

### Rule IDs

| Rule ID | Default Severity | Description |
|---------|-----------------|-------------|
| `skill/missing-frontmatter` | `error` | No YAML frontmatter found |
| `skill/invalid-frontmatter` | `error` | YAML frontmatter present but could not be parsed |
| `skill/missing-name` | `error` | Name field is missing |
| `skill/invalid-name-format` | `error` | Name is not lowercase alphanumeric with hyphens or exceeds 64 chars |
| `skill/name-mismatch` | `error` | Name does not match the parent directory name |
| `skill/missing-description` | `error` | Description field is missing |
| `skill/invalid-description` | `error` | Description is whitespace-only, too long, or wrong type |
| `skill/missing-allowed-tools` | `warn` | Recommended `allowed-tools` field is missing |

### Examples

#### Successful Skill Lint

```
Discovered 2 skill(s)
✔ .github/skills/code-review/SKILL.md: OK
✔ .github/skills/testing/SKILL.md: OK
All skill(s) passed lint checks
```

#### Skill Lint With Errors

```
Discovered 1 skill(s)
✖ .github/skills/testing/SKILL.md:1: Missing YAML frontmatter
lint failed: 1 error(s), 0 warning(s)
```

---

## Agent Linting (`--agents`)

Validates YAML frontmatter in `.github/agents/*.md` files.

### What It Validates

| Field | Required? | Validation |
|-------|-----------|------------|
| `name` | Yes | Non-empty, lowercase with hyphens, max 64 chars, matches filename stem |
| `description` | Yes | Non-empty, max 1024 chars, not whitespace-only |

### Rule IDs

| Rule ID | Default Severity | Description |
|---------|-----------------|-------------|
| `agent/missing-frontmatter` | `error` | No YAML frontmatter found |
| `agent/invalid-frontmatter` | `error` | YAML frontmatter present but could not be parsed |
| `agent/missing-name` | `error` | Name field is missing |
| `agent/invalid-name-format` | `error` | Name is not lowercase alphanumeric with hyphens or exceeds 64 chars |
| `agent/name-mismatch` | `error` | Name does not match the filename stem |
| `agent/missing-description` | `error` | Description field is missing |
| `agent/invalid-description` | `error` | Description is whitespace-only, too long, or wrong type |
| `agent/invalid-field` | `warn` | Other field validation failure |

### Examples

#### Successful Agent Lint

```
Discovered 1 agent(s)
✔ .github/agents/security.md: OK
All agent(s) passed lint checks
```

#### Agent Lint With Errors

```
Discovered 1 agent(s)
✖ .github/agents/security.md:2 [name]: Name must contain only lowercase letters, numbers, and hyphens
✖ .github/agents/security.md:3 [description]: Description is required
lint failed: 2 error(s), 0 warning(s)
```

---

## Instruction Quality Analysis (`--instructions`)

Analyzes the structural quality of feedback loop documentation in instruction files. Scores how well commands like `npm test` and `npm run build` are documented across three dimensions.

### Supported Instruction File Formats

| File / Pattern | Agent Platform |
|----------------|----------------|
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.github/instructions/*.md` | GitHub Copilot (scoped) |
| `.github/agents/*.md` | GitHub Copilot (custom agents) |
| `AGENTS.md` | Any AI coding agent (community standard) |
| `CLAUDE.md` | Claude Code |

### Quality Dimensions

Each feedback loop command is scored on three dimensions (0 or 1 each):

| Dimension | Score of 1 when... |
|-----------|-------------------|
| **Structural Context** | Command appears under a matched heading (e.g., `## Validation`, `## Commands`) |
| **Execution Clarity** | Command appears inside a code block (fenced or inline) |
| **Loop Completeness** | Conditional keywords (`if`, `fail`, `fix`, `error`, etc.) appear near the code block |

### Rule IDs

| Rule ID | Default Severity | Description |
|---------|-----------------|-------------|
| `instruction/parse-error` | `warn` | Instruction file could not be parsed |
| `instruction/command-not-in-code-block` | `warn` | Command appears only in prose, not in a code block |
| `instruction/command-outside-section` | `warn` | Command is not under a dedicated feedback loop section |
| `instruction/missing-error-handling` | `warn` | Command has no error handling guidance |

The **composite score** per command is the average of the three dimensions. The **overall quality score** (0–100%) is the average of all mandatory command composite scores.

### Examples

#### Instruction Analysis Output

```
Discovered 2 instruction file(s)
  .github/copilot-instructions.md (copilot-instructions)
  CLAUDE.md (claude-md)
Overall instruction quality score: 67%
⚠ Some commands are not documented in code blocks
```

#### No Instruction Files Found

```
No instruction files found
```

---

## Output Formats (`--format`)

### Human (default)

Colored console output with severity indicators:

- `✖` for errors
- `⚠` for warnings
- `ℹ` for info

```bash
npx @lousy-agents/cli lint --format human
```

### JSON

Structured JSON array of `LintDiagnostic` objects written to stdout. Suitable for programmatic consumption and LLM interpretation.

```bash
npx @lousy-agents/cli lint --format json
```

```json
[
  {
    "filePath": ".github/agents/security.md",
    "line": 2,
    "severity": "error",
    "message": "Name is required",
    "ruleId": "agent/missing-name",
    "field": "name",
    "target": "agent"
  }
]
```

### Reviewdog Diagnostic Format (`rdjsonl`)

JSON Lines format compatible with [`reviewdog -f=rdjsonl`](https://github.com/reviewdog/reviewdog). Each line is a standalone JSON object.

```bash
npx @lousy-agents/cli lint --format rdjsonl
```

```json
{"message":"Name is required","location":{"path":".github/agents/security.md","range":{"start":{"line":2}}},"severity":"ERROR","code":{"value":"agent/missing-name"}}
```

---

## Help

```bash
npx @lousy-agents/cli lint --help
```

## CI Integration

The `lint` command returns a non-zero exit code when errors are found, making it suitable for CI pipelines:

```yaml
# Lint everything
- name: Lint all targets
  run: npx @lousy-agents/cli lint

# Lint specific targets
- name: Lint agent skills
  run: npx @lousy-agents/cli lint --skills

- name: Lint custom agents
  run: npx @lousy-agents/cli lint --agents

# Machine-readable output for reviewdog
- name: Lint with reviewdog
  run: npx @lousy-agents/cli lint --format rdjsonl | reviewdog -f=rdjsonl
```
