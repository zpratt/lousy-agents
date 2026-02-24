# `lint` Command

Validates agent skills, custom agents, and instruction files. Discovers lint targets in the repository, checks YAML frontmatter and instruction quality, and reports diagnostics with line numbers.

## Features

- **Unified Linting**: Lint skills, agents, and instruction files through a single command
- **Automatic Discovery**: Finds targets across `.github/skills/`, `.github/agents/`, and instruction file locations
- **Frontmatter Validation**: Checks for required fields and validates their format
- **Instruction Quality Analysis**: Scores feedback loop documentation across three dimensions (structural context, execution clarity, loop completeness)
- **Line-Level Diagnostics**: Reports errors and warnings with exact line numbers
- **Multiple Output Formats**: Human-readable (default), JSON, and reviewdog-compatible JSON Lines
- **Exit Codes**: Returns non-zero exit code when errors are found, enabling CI integration

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

| Rule ID | Description |
|---------|-------------|
| `agent/missing-frontmatter` | No YAML frontmatter found |
| `agent/invalid-frontmatter` | YAML frontmatter present but could not be parsed |
| `agent/missing-name` | Name field is missing |
| `agent/invalid-name-format` | Name is not lowercase-with-hyphens or exceeds 64 chars |
| `agent/name-mismatch` | Name does not match the filename stem |
| `agent/missing-description` | Description field is missing |
| `agent/invalid-description` | Description is whitespace-only, too long, or wrong type |

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

---

## GitHub Action

A composite GitHub Action is available for automated inline PR review comments via [reviewdog](https://github.com/reviewdog/reviewdog). The action installs the CLI, runs `lousy-agents lint --format rdjsonl`, and pipes the output to reviewdog.

### Quick Start

```yaml
- name: Lint with lousy-agents
  uses: zpratt/lousy-agents@main
  with:
    github_token: ${{ github.token }}
```

When no target inputs are set, the action lints all targets (skills, agents, and instructions).

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github_token` | Yes | — | GitHub token for reviewdog API access |
| `skills` | No | `false` | Lint skill frontmatter in `.github/skills/` |
| `agents` | No | `false` | Lint agent frontmatter in `.github/agents/` |
| `instructions` | No | `false` | Lint instruction quality |
| `directory` | No | `.` | Target directory to lint |
| `reporter` | No | `github-pr-check` | reviewdog reporter (`github-pr-check`, `github-pr-review`, `github-check`) |
| `filter_mode` | No | `added` | reviewdog filter mode (`added`, `diff_context`, `file`, `nofilter`) |
| `level` | No | `info` | Minimum severity level (`info`, `warning`, `error`) |
| `version` | No | `latest` | `@lousy-agents/cli` version to install. Set to `local` to skip install. |

### Examples

Lint only agents with PR review comments:

```yaml
- name: Lint agents
  uses: zpratt/lousy-agents@main
  with:
    github_token: ${{ github.token }}
    agents: 'true'
    reporter: 'github-pr-review'
```

Use a locally-built CLI (e.g., in the lousy-agents repo itself):

```yaml
- name: Build and link CLI
  run: |
    npm ci
    npm run build
    npm link

- name: Lint with lousy-agents
  uses: ./
  with:
    github_token: ${{ github.token }}
    version: 'local'
```
