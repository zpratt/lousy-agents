# `lint` Command

Validates agent skills, custom agents, hook configurations, and instruction files. Discovers lint targets in the repository, checks YAML frontmatter, JSON configuration, and instruction quality, and reports diagnostics with line numbers.

## Features

- **Unified Linting**: Lint skills, agents, hook configurations, and instruction files through a single command
- **Automatic Discovery**: Finds targets from the canonical agentic location catalog in `@lousy-agents/core` (see [Discovery locations](#discovery-locations))
- **Frontmatter Validation**: Checks for required fields and validates their format
- **Hook Configuration Validation**: Validates JSON hook config files for Copilot and Claude Code against expected schemas
- **Instruction Quality Analysis**: Scores feedback loop documentation across three dimensions (structural context, execution clarity, loop completeness)
- **Line-Level Diagnostics**: Reports errors and warnings with exact line numbers
- **Multiple Output Formats**: Human-readable (default), JSON, and reviewdog-compatible JSON Lines
- **Configurable Rules**: Customize rule severity per-project via `lousy-agents.config.ts`
- **Exit Codes**: Returns non-zero exit code when errors are found, enabling CI integration

## Discovery locations

Paths come from the shared agentic location catalog in `@lousy-agents/core` (also used by `doctor`). Lint validates the following targets — **skills, agents, hooks, and instructions run by default**; **subagents and MCP servers are flag-only** (see [Rollout status](#rollout-status)).

| Target | Default-on | Discovered paths |
| ------ | ---------- | ---------------- |
| **Skills** | Yes | `.github/skills/*/SKILL.md`, `.claude/skills/*/SKILL.md`, `.agents/skills/*/SKILL.md`, `.pi/skills/*/SKILL.md`, `.pi/prompts/*/SKILL.md` (one level of skill directories). Skills listed in root `skills-lock.json` are omitted from lint. |
| **Agents** | Yes | `.github/agents/**/*.md` (markdown agent definitions) |
| **Subagents** | No — flag-only | `.claude/agents/**/*.md` (Claude Code subagent definitions) |
| **Hooks** | Yes | `.github/hooks/agent-shell/hooks.json` (Copilot); `.claude/settings.json`, `.claude/settings.local.json` (Claude). Copilot files are discovered only when their content includes a `preToolUse` marker; Claude files are discovered whenever they declare a `hooks` object. Symlinks are skipped. |
| **Instructions** | Yes | `.github/copilot-instructions.md`, `.github/instructions/*.md`, `.github/agents/*.md` (dual-use with agent lint), root `AGENTS.md`, root `CLAUDE.md` |
| **MCP servers** | No — flag-only | `.mcp.json`, `.vscode/mcp.json` |

### Rollout status

New construct kinds ship **flag-only first**, then get promoted to default-on once they pass a GA checklist (catalog coverage, rules, docs, CLI/API wiring, parity tests). This mirrors the rollout policy of the [lint construct-coverage epic](https://github.com/zpratt/lousy-agents/issues/1039).

| Kind | Status |
| ---- | ------ |
| Skills, agents, hooks, instructions | GA — default-on |
| Subagents (`--subagents`) | Flag-only |
| MCP servers (`--mcp-servers`) | Flag-only |
| `.claude/commands` under the agents target | Not yet covered — Claude Code slash commands use a different frontmatter contract than Copilot custom agents (no required `name` field); reusing the existing agent rule set would misclassify valid command files. Deferred pending a command-specific rule set. |
| Multi-harness instruction formats (GEMINI.md, hermes, crush conventions) | Not yet covered — deferred pending a structural-baseline rule design for formats without quality scoring. |
| Plugins (`.codex-plugin`) | Explicitly deferred (not silently skipped) — no stable on-disk manifest schema is evidenced in this repo's fixtures or docs. Doctor still inventories plugin locations; lint does not validate them. |

### Lint vs doctor

Lint and doctor share the same catalog. Doctor may inventory additional constructs the linter does not validate (plugins, multi-harness instruction trees, and other catalog entries with no lint target). Full doctor command reference: [`doctor.md`](doctor.md).

Intentional policy differences (not catalog drift):

- **skills-lock.json** — lint-only filter for locked third-party skills
- **Hook content heuristic** — Copilot hook configs are only discovered when they contain `preToolUse`; a Copilot config without that marker remains undiscovered by lint even though doctor may inventory the containing directory. Claude settings files no longer use a per-event marker: they are discovered whenever they declare a `hooks` object.
- **Symlinks** — lint skips symlinked targets; doctor follows in-repo symlinks when inventorying

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
      subagents: {
        "subagent/name-mismatch": "off",
      },
      hooks: {
        "hook/missing-timeout": "off",
      },
      instructions: {
        "instruction/command-outside-section": "off",
      },
      skills: {
        "skill/missing-allowed-tools": "error",
      },
      mcpServers: {
        "mcpserver/invalid-config": "warn",
      },
    },
  },
};
```

### Severity Levels

| Severity | Behavior |
| ---------- | ---------- |
| `"error"` | Emits an error diagnostic and causes a non-zero exit code |
| `"warn"` | Emits a warning diagnostic but does not affect the exit code |
| `"off"` | Suppresses the diagnostic entirely |

### Default Behavior

When no configuration file is found, or when a rule is not specified in the configuration, the lint command uses the default severity for each rule. Defaults match the current hardcoded behavior:

- **Agent rules**: All default to `"error"` except `agent/invalid-field` which defaults to `"warn"`
- **Subagent rules**: All default to `"error"` except `subagent/invalid-field`, `subagent/invalid-name-format`, and `subagent/name-mismatch`, which default to `"warn"` — Claude Code's documented subagent contract only requires `name` and `description`; it does not specify a name format or tie `name` to the filename the way Copilot custom agents do
- **Instruction rules**: All default to `"warn"`
- **Skill rules**: All default to `"error"` except `skill/missing-allowed-tools` and `skill/missing-argument-hint` which default to `"warn"`
- **Hook rules**: All default to `"error"` except `hook/missing-matcher` and `hook/missing-timeout` which default to `"warn"`
- **MCP server rules**: All default to `"error"`

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

Run from your project root to lint the default-on targets (skills, agents, hooks, and instructions):

```bash
npx @lousy-agents/cli lint
```

When no target flags are provided, the command runs the default-on linters (skills, agents, hooks, and instructions). The flag-only `subagents` and `mcpServers` targets never run unless explicitly requested — see [Rollout status](#rollout-status).

### Target Flags

Use flags to lint specific targets:

| Flag / Subcommand | Default-on | Description |
| ------ | ---------- | ------------- |
| `--skills` | Yes | Lint skill frontmatter in `.github/skills/`, `.claude/skills/`, `.agents/skills/`, `.pi/skills/`, and `.pi/prompts/` |
| `--agents` | Yes | Lint agent frontmatter in `.github/agents/` |
| `--subagents` | No — flag-only | Lint Claude Code subagent frontmatter in `.claude/agents/` |
| `--hooks` | Yes | Lint hook configuration files for Copilot and Claude Code |
| `--instructions` | Yes | Analyze instruction quality across all instruction file formats |
| `--mcp-servers` | No — flag-only | Validate MCP server config files (`.mcp.json`, `.vscode/mcp.json`) |
| `lessons` | — | Validate lesson files in `.lousy-agents/lessons/` — see [Agent Lessons](lessons.md#lint-lessons) |
| `--format <type>` | — | Output format: `human` (default), `json`, or `rdjsonl` |

```bash
# Lint only skills
npx @lousy-agents/cli lint --skills

# Lint only agents
npx @lousy-agents/cli lint --agents

# Lint only hook configurations
npx @lousy-agents/cli lint --hooks

# Analyze only instruction quality
npx @lousy-agents/cli lint --instructions

# Lint Claude Code subagents (flag-only, opt in explicitly)
npx @lousy-agents/cli lint --subagents

# Validate MCP server configs (flag-only, opt in explicitly)
npx @lousy-agents/cli lint --mcp-servers

# Lint the default-on targets (same as no flags)
npx @lousy-agents/cli lint
```

---

## Skill Linting (`--skills`)

Validates YAML frontmatter in `.github/skills/*/SKILL.md`, `.claude/skills/*/SKILL.md`, and `.agents/skills/*/SKILL.md` files (one directory level under each skills root).

When a root `skills-lock.json` is present, skill names listed under its `skills` key are treated as locked third-party installs and are omitted from skill lint discovery. Malformed or missing lock files are ignored (no filtering).

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
| --------- | ----------------- | ------------- |
| `skill/missing-frontmatter` | `error` | No YAML frontmatter found |
| `skill/invalid-frontmatter` | `error` | YAML frontmatter present but could not be parsed |
| `skill/missing-name` | `error` | Name field is missing |
| `skill/invalid-name-format` | `error` | Name is not lowercase alphanumeric with hyphens or exceeds 64 chars |
| `skill/name-mismatch` | `error` | Name does not match the parent directory name |
| `skill/missing-description` | `error` | Description field is missing |
| `skill/invalid-description` | `error` | Description is whitespace-only, too long, or wrong type |
| `skill/missing-allowed-tools` | `warn` | Recommended `allowed-tools` field is missing |
| `skill/missing-argument-hint` | `warn` | Recommended `argument-hint` field is missing |

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
| ------- | ----------- | ------------ |
| `name` | Yes | Non-empty, lowercase with hyphens, max 64 chars, matches filename stem |
| `description` | Yes | Non-empty, max 1024 chars, not whitespace-only |

### Rule IDs

| Rule ID | Default Severity | Description |
| --------- | ----------------- | ------------- |
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

## Subagent Linting (`--subagents`) — flag-only

**Not default-on.** Only runs when `--subagents` is explicitly passed, even if no other target flags are set — see [Rollout status](#rollout-status).

Validates YAML frontmatter in `.claude/agents/**/*.md` files, discovered recursively (Claude Code subagent definitions). Rules mirror agent linting: Claude Code subagents require the same `name` + `description` frontmatter contract as Copilot custom agents.

### What It Validates

| Field | Required? | Validation |
| ------- | ----------- | ------------ |
| `name` | Yes | Non-empty, lowercase with hyphens, max 64 chars, matches filename stem |
| `description` | Yes | Non-empty, max 1024 chars, not whitespace-only |

### Rule IDs

| Rule ID | Default Severity | Description |
| --------- | ----------------- | ------------- |
| `subagent/missing-frontmatter` | `error` | No YAML frontmatter found |
| `subagent/invalid-frontmatter` | `error` | YAML frontmatter present but could not be parsed |
| `subagent/missing-name` | `error` | Name field is missing |
| `subagent/invalid-name-format` | `warn` | Name is not lowercase alphanumeric with hyphens or exceeds 64 chars — not required by Claude Code's own subagent contract, so this is opinionated stricter validation, not a spec violation |
| `subagent/name-mismatch` | `warn` | Name does not match the filename stem — Claude Code identifies subagents by the `name` field, not the filename, so this is a style suggestion, not a spec violation |
| `subagent/missing-description` | `error` | Description field is missing |
| `subagent/invalid-description` | `error` | Description is whitespace-only, too long, or wrong type |
| `subagent/invalid-field` | `warn` | Other field validation failure |

### Examples

#### Successful Subagent Lint

```
Discovered 1 subagent(s)
✔ .claude/agents/reviewer.md: OK
All subagent(s) passed lint checks
```

#### Subagent Lint With Errors

```
Discovered 1 subagent(s)
✖ .claude/agents/reviewer.md:1: Missing YAML frontmatter. Subagent files must begin with --- delimited YAML frontmatter.
lint failed: 1 error(s), 0 warning(s)
```

---

## Instruction Quality Analysis (`--instructions`)

Analyzes the structural quality of feedback loop documentation in instruction files. Scores how well commands like `npm test` and `npm run build` are documented across three dimensions.

### Supported Instruction File Formats

| File / Pattern | Agent Platform |
| ---------------- | ---------------- |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.github/instructions/*.md` | GitHub Copilot (scoped) |
| `.github/agents/*.md` | GitHub Copilot (custom agents) |
| `AGENTS.md` | Any AI coding agent (community standard) |
| `CLAUDE.md` | Claude Code |

### Quality Dimensions

Each feedback loop command is scored on three dimensions (0 or 1 each):

| Dimension | Score of 1 when... |
| ----------- | ------------------- |
| **Structural Context** | Command appears under a matched heading (e.g., `## Validation`, `## Commands`) |
| **Execution Clarity** | Command appears inside a code block (fenced or inline) |
| **Loop Completeness** | Conditional keywords (`if`, `fail`, `fix`, `error`, etc.) appear near the code block |

### Rule IDs

| Rule ID | Default Severity | Description |
| --------- | ----------------- | ------------- |
| `instruction/parse-error` | `warn` | Instruction file could not be parsed |
| `instruction/command-not-in-code-block` | `warn` | Command appears only in prose, not in a code block |
| `instruction/command-outside-section` | `warn` | Command is not under a dedicated feedback loop section |
| `instruction/missing-error-handling` | `warn` | Command has no error handling guidance |
| `instruction/missing-structural-heading` | `warn` | Instruction file is missing one or more recommended structural heading sections; may emit multiple warnings per file (one per missing section) |

The `instruction/missing-structural-heading` rule warns when an instruction file does not contain one or more of the following recommended heading sections: **Validation**, **Verification**, **Feedback Loop**, **Mandatory**, **Before Commit**, **Validation Suite**, **Commands**. These headings guide coding agents through validation and verification workflows. Because instruction files stack on each other across the filesystem, this rule fires per file and is a warning (not an error).

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

## Hook Configuration Linting (`--hooks`)

Validates hook configuration files for GitHub Copilot and Claude Code. Catches JSON syntax errors, schema violations, and missing recommended fields before hooks are used at runtime.

### Discovered Files

| File Path | Platform |
| --------- | -------- |
| `.github/hooks/agent-shell/hooks.json` | GitHub Copilot |
| `.claude/settings.json` | Claude Code |
| `.claude/settings.local.json` | Claude Code (local override) |

Discovery differs by platform. Claude settings files are discovered when they contain a `hooks` object, regardless of which events it declares; when the JSON is malformed, a `"hooks":` substring match is used instead so the file is still reported as `hook/invalid-json`. Copilot hook configs remain heuristic-based: they are only discovered if they contain the `"preToolUse"` key, so a `.github/hooks/agent-shell/hooks.json` that only defines `sessionStart` hooks will not be discovered or linted. Symlinks are skipped for security.

### What It Validates

**Copilot hooks** (`.github/hooks/agent-shell/hooks.json`):

- `version` must be `1`
- Hook lifecycle arrays: `sessionStart`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `sessionEnd`
- Each command must have at least one of `bash` or `powershell` (non-empty)
- Recommends `timeoutSec` for each hook command

**Claude Code hooks** (`.claude/settings.json`, `.claude/settings.local.json`):

- A `hooks` object whose keys are Claude Code hook event names. Every event is optional and any combination may be used; an unknown event name is an error, since a misspelled event silently never fires
- Each entry must have a `hooks` array of handlers and may carry an optional `matcher`
- Each handler is validated against its `type`: `command` (requires `command`), `http` (requires `url`), `mcp_tool` (requires `server` and `tool`), `prompt` and `agent` (require `prompt`). Shared optional fields (`timeout`, `statusMessage`, `if`, `once`) and type-specific ones (`args`, `shell`, `async`, `headers`, `model`, …) are accepted
- Recommends `matcher` on entries for events that support one (without it, the hook runs for every occurrence). Events that accept no matcher — `Stop`, `UserPromptSubmit`, and others — are exempt

### Rule IDs

| Rule ID | Default Severity | Description |
| --------- | ----------------- | ------------- |
| `hook/invalid-json` | `error` | JSON parsing failed |
| `hook/invalid-config` | `error` | Configuration structure does not match expected schema |
| `hook/missing-command` | `error` | Hook command field missing or empty |
| `hook/unknown-event` | `error` | Unknown Claude hook event name — a misspelled event silently never fires |
| `hook/missing-matcher` | `warn` | Recommended `matcher` field missing from a Claude hook entry whose event supports one |
| `hook/missing-timeout` | `warn` | Recommended `timeoutSec` field missing from Copilot hook command |

### Examples

#### Successful Hook Lint

```
Discovered 1 hook config(s)
✔ .github/hooks/agent-shell/hooks.json: OK
All hook config(s) passed lint checks
```

#### Hook Lint With Errors

```
Discovered 1 hook config(s)
✖ .github/hooks/agent-shell/hooks.json:1 [hooks.preToolUse.0]: At least one of 'bash' or 'powershell' must be provided and non-empty
lint failed: 1 error(s), 0 warning(s)
```

#### Hook Lint With Warnings

```
Discovered 1 hook config(s)
⚠ .claude/settings.json:1 [hooks.PreToolUse[0].matcher]: Recommended field 'matcher' is missing from PreToolUse hook entry. Without a matcher, the hook runs for every occurrence.
Lint passed with 1 warning(s)
```

---

## MCP Server Config Linting (`--mcp-servers`) — flag-only

**Not default-on.** Only runs when `--mcp-servers` is explicitly passed, even if no other target flags are set — see [Rollout status](#rollout-status).

Validates MCP server configuration files: `.mcp.json` (shared — read by both Claude Code and Copilot) and `.vscode/mcp.json` (Copilot in VS Code). One config file can declare multiple servers; diagnostics are scoped to the config file, not to individual servers. A file declaring zero servers is not an error.

### What It Validates

- The file parses as valid JSON
- When present, `mcpServers` (Claude Code's `.mcp.json` convention) or `servers` (VS Code's `.vscode/mcp.json` convention) is a map of server name to server declaration — both keys are accepted regardless of which file is being read
- Each server declaration's optional `type` / `transport` fields, when present, must be non-empty strings
- Server names must not be `__proto__`, `constructor`, or `prototype` (reserved JavaScript property names)

### Rule IDs

| Rule ID | Default Severity | Description |
| --------- | ----------------- | ------------- |
| `mcpserver/invalid-json` | `error` | JSON parsing failed |
| `mcpserver/invalid-config` | `error` | Configuration structure does not match expected schema (e.g. `mcpServers` is not a map, or a server declaration has an empty `type`/`transport`) |

### Examples

#### Successful MCP Server Lint

```
Discovered 1 MCP server config(s)
✔ .mcp.json: OK
All MCP server config(s) passed lint checks
```

#### MCP Server Lint With Errors

```
Discovered 1 MCP server config(s)
✖ .mcp.json:1: Invalid JSON in MCP server configuration file: Unexpected token in JSON
lint failed: 1 error(s), 0 warning(s)
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

- name: Lint hook configurations
  run: npx @lousy-agents/cli lint --hooks

# Machine-readable output for reviewdog
- name: Lint with reviewdog
  run: npx @lousy-agents/cli lint --format rdjsonl | reviewdog -f=rdjsonl
```

---

## GitHub Action

A composite GitHub Action is available for automated inline feedback via [reviewdog](https://github.com/reviewdog/reviewdog). The action runs lint checks using a bundled JavaScript entry point that calls the `@lousy-agents/core` APIs directly, then pipes the output to reviewdog. By default it produces GitHub Check annotations (`github-pr-check`); switch to `reporter: github-pr-review` for inline PR review comments.

### Prerequisites

The action requires **Node.js ≥ 20** to be available on the runner. GitHub-hosted runners (`ubuntu-latest`, `windows-latest`, `macos-latest`) include Node.js by default. For self-hosted runners or custom container jobs, ensure Node.js ≥ 20 is installed before using this action.

### Quick Start

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    if: github.event.pull_request.head.repo.fork == false
    permissions:
      contents: read
      checks: write

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Lint with lousy-agents
        uses: zpratt/lousy-agents@v3
        with:
          github_token: ${{ github.token }}
```

When no target inputs are set, the action lints the default-on targets (skills, agents, hooks, and instructions). The flag-only `subagents` and `mcpServers` targets are not yet exposed as Action inputs — per the [rollout policy](#rollout-status), Action inputs are added only once a kind reaches GA (or is explicitly marked experimental). Use the `@lousy-agents/cli` or `@lousy-agents/lint` package directly if you need them in CI today.

### Inputs

| Input | Required | Default | Description |
| ------- | ---------- | --------- | ------------- |
| `github_token` | Yes | — | GitHub token for reviewdog API access |
| `skills` | No | `false` | Lint skill frontmatter in `.github/skills/`, `.claude/skills/`, and `.agents/skills/` |
| `agents` | No | `false` | Lint agent frontmatter in `.github/agents/` |
| `hooks` | No | `false` | Lint hook configuration files for Copilot and Claude Code |
| `instructions` | No | `false` | Lint instruction quality |
| `directory` | No | `.` | Target directory to lint |
| `reporter` | No | `github-pr-check` | reviewdog reporter (`github-pr-check`, `github-pr-review`, `github-check`) |
| `filter_mode` | No | `added` | reviewdog filter mode (`added`, `diff_context`, `file`, `nofilter`) |
| `level` | No | `info` | Minimum severity level (`info`, `warning`, `error`) |

### Permissions

The action uses reviewdog to post results via the GitHub API, so the workflow job
needs explicit `permissions` depending on the chosen `reporter`:

| Reporter | Required Permissions |
| ---------- | --------------------- |
| `github-pr-check` (default) | `contents: read`, `checks: write` |
| `github-check` | `contents: read`, `checks: write` |
| `github-pr-review` | `contents: read`, `pull-requests: write` |

Example job-level permissions for the default reporter:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write
    steps:
      - uses: actions/checkout@v4
      - uses: zpratt/lousy-agents@v3
        with:
          github_token: ${{ github.token }}
```

> **Note:** For PRs from forks the `GITHUB_TOKEN` is read-only, so reviewdog
> cannot post checks or reviews. Guard the job with
> `if: github.event.pull_request.head.repo.fork == false` to avoid 403 errors.

### Examples

Lint only agents with PR review comments:

```yaml
- name: Lint agents
  uses: zpratt/lousy-agents@v3
  with:
    github_token: ${{ github.token }}
    agents: 'true'
    reporter: 'github-pr-review'
```

Use in the lousy-agents repo itself (builds the action from source):

```yaml
- name: Build action
  run: |
    npm ci
    npm run build --workspace=packages/action

- name: Lint with lousy-agents
  uses: ./
  with:
    github_token: ${{ github.token }}
```
