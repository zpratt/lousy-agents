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
| **Instructions** | Yes | `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md` (only files whose name ends in `.instructions.md`, as Copilot loads them; a `README.md` there is not an instruction file), `.github/agents/*.md` (dual-use with agent lint), root `AGENTS.md`, root `AGENTS.override.md`, root `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.md`, `AGENTS.md`, `AGENTS.MD`, and `agents.md` at any depth the root walk lists. `CLAUDE.md` and `AGENTS.md` inside `.github/instructions/` are Claude and shared instructions, not Copilot scoped files. A copy inside a directory that already loads the file, such as `.github/agents/CLAUDE.md` or `.claude/skills/example/AGENTS.md`, keeps that directory's construct |
| **MCP servers** | No — flag-only | `.mcp.json`, `.vscode/mcp.json` |

### Discovery limits

Instruction directories such as `.github/instructions` are walked by the same bounded walk that `doctor` uses (`@lousy-agents/core`), so the two tools share one set of ordering, symlink and limit rules. They do not always see the same files: see *Differences from doctor* below.

The walk:

- **Depth**: the entry directory is depth 0, directories through depth 10 are listed, and a subdirectory of a directory at depth 10 is not entered. A directory below that limit is not entered, and lint reports it with the discovery-limit warning described under *Directory cap*, because `.github/instructions/**/*.instructions.md` files at any depth are loaded by Copilot
- **Skipped directories**: `node_modules`, `.git`, and `dist` are never walked. A `tests/fixtures` pair, a directory named `__fixtures__`, and a directory named `testdata` are not entered either, including when the directory lint was started in is named `tests`. The same rules apply to agent and skill discovery. A `fixtures` directory that is not the child of `tests`, such as `src/fixtures`, is still walked
- **Order**: entries are visited in UTF-16 code-unit order of their names (not locale order), so which path wins for a shared file does not depend on the file system (APFS lists sorted, ext4 does not) or on the machine's locale
- **Symlinks**: a symlinked directory or file is followed only when its real target stays inside the repository. Instruction discovery lists every in-repo alias, and each listing counts against the directory cap and the entry budget. Lint then reports one path per real file: the full relative path that sorts first by UTF-16 code unit. That is not the directory a name-ordered walk meets first. `b-extra/file` sorts before `b/file`, because `-` comes before `/`. A symlink that would have been used but points outside the repository (an instruction file such as `CLAUDE.md`, `AGENTS.md`, `AGENTS.MD`, or `agents.md`, a `*.md` file below an instruction directory, or an instruction directory itself) is skipped, and lint reports every such link in one `instruction/discovery-symlink-skipped` warning, naming up to five paths and counting the rest. A directory symlink that is not one of those filenames and is not an instruction directory, such as `vendor` or `docs`, is not reported
- **Unreadable entries**: a directory the process cannot list, or an entry it cannot inspect (permission denied, a symlink loop, too many open files), is skipped without a diagnostic and the walk goes on, so the files beside it are still found. A run as a user who cannot read an instruction directory analyzes less than a run that can, and does not say so.
- **Directory cap**: at most 10,000 directories are listed per walk. When the cap is reached, lint keeps the instruction files it already found, stops listing more directories, and emits exactly one `instruction/discovery-limit-reached` warning. The warning appears in human output, `--format json`, `--format rdjsonl` (as a `WARNING` with the rule ID as `code.value`) and in the MCP `analyze_instruction_quality` `diagnostics[]`, and it is a warning like any other, so it does not fail a run by itself. The cap is not configurable from the command line. The same warning, with a message that names the depth, is emitted when a directory lies below the depth limit, and with a message that names the entry budget when that budget is spent. A run that reaches several limits still emits exactly one warning
- **Entry budget**: at most 200,000 directory entries are examined per walk, counting every entry of every directory the walk lists. It bounds the work itself, whatever the shape of the tree. Instruction discovery lists every in-repo alias, so a tree of directory aliases spends the budget in lint the same way it does in `doctor`. When the budget is spent, lint keeps the instruction files it already found, stops walking, and emits the same `instruction/discovery-limit-reached` warning, once, with a message that says it stopped after examining 200,000 directory entries. The budget is not configurable from the command line

Differences from doctor, which are on purpose:

- **Nested `CLAUDE.md` and `AGENTS.md`**: both tools discover `CLAUDE.md`, `AGENTS.md`, `AGENTS.MD`, and `agents.md` when the parent directory's segment count is at most 10 (the root walk's depth). A copy inside a directory that already loads the file keeps that directory's construct. `CLAUDE.md` and `AGENTS.md` under `.github/instructions/` are Claude and shared instructions
- **Start and depth**: both tools walk `*.instructions.md` from each instruction location (depth 0 is `.github/instructions` itself) to a depth of 10, and both walk `CLAUDE.md`, `AGENTS.md`, `AGENTS.MD`, and `agents.md` from the repository root to a depth of 10. A `*.instructions.md` nested nine or ten directories below `.github/instructions` is analyzed by both. The file eleven directories below is analyzed by neither. A `CLAUDE.md` nine directories below `.github/instructions` is out for both tools: its parent has 11 segments, and the root walk lists a directory only when its segment count is at most 10. When the nested-filename walk leaves a directory unentered outside an instruction location, the `instruction/discovery-limit-reached` warning names those four filenames as what may be missing. A depth stop inside `.github/instructions` stays the signal for `*.instructions.md`
- **Import scope**: doctor judges each `@` import written in a `claude`-harness file (such as `CLAUDE.md` or `.claude/CLAUDE.md`) with the same target classification lint uses, but it does not judge the imports inside a file only Claude reaches through such an import or through a shared harness file such as `AGENTS.md`, and it does not follow imports transitively or detect cycles. Lint expands imports transitively from every entrypoint and reports `instruction/import-cycle`. Widening doctor's scope is tracked in [#1517](https://github.com/zpratt/lousy-agents/issues/1517).
- **Import cap**: both tools stop at 256 `@` tokens, but doctor counts them per file, while lint counts them across the whole expansion of each entrypoint, in every file it reaches. The number is the same; the scope is not.
- **Skipped symbolic links**: doctor's `discovery-symlink-skipped` covers every symbolic link in the repository that would have been scanned and points outside it, which is wider than lint's `instruction/discovery-symlink-skipped`. Lint reports an instruction filename (`CLAUDE.md`, `AGENTS.md`, `AGENTS.MD`, `agents.md`), a `*.md` file below an instruction directory, or an instruction directory. A `vendor` or `docs` directory symlink that points outside the repository is not reported.
- **Files that cannot be read**: lint reports a discovered instruction file it cannot open or that is over 1 MiB as `instruction/parse-error`. It refuses a hard-linked file for every file discovered as `claude-md`, including a nested `CLAUDE.md`, so a hard-linked `AGENTS.md` or Copilot instruction file is analyzed by lint. Doctor reads every markdown file a harness owns with the strict reader (one hard link, within the size cap), so it also names a hard-linked `AGENTS.md`, and a skill or agent file it refuses, in the advisory `instruction-file-unread` finding, once, naming up to five of the files. Lint does not check skills or agents for this; doctor does.

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
- **Symlinks** — lint skips symlinked skill, agent and hook targets; instruction files and their `@` imports follow in-repo symlinks, as doctor does when inventorying

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
| `.github/instructions/**/*.instructions.md` | GitHub Copilot (scoped) |
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
| `instruction/missing-structural-heading` | `warn` | Instruction file is missing one or more recommended structural heading sections; may emit multiple warnings per file (one per missing section). For Claude entrypoints (`CLAUDE.md`), evaluated against the **effective** document after `@` import expansion |
| `instruction/import-unresolved` | `warn` | Claude `@` import target could not be resolved, is not a regular file (a directory, a named pipe, or a symbolic link that loops), could not be read (the system refused access, the process had too many files open, or the file changed while it was being read; the diagnostic says "could not be read"), or has more than one hard link (the diagnostic says "hard link"; this only happens locally, for example with pnpm stores or `cp -al` trees) |
| `instruction/import-escape` | `warn` | Claude `@` import resolves outside the working directory: a `../` path that leaves the repository, an absolute path outside it, or a `~/` path. The message says Claude Code loads such an import only after a one-time approval in an interactive session. An absolute path *inside* the repository is a valid import. The `~/` case is docs-based and was not observed in testing |
| `instruction/import-symlink` | `warn` | Claude `@` import resolves through a symbolic link to a location outside the repository, or its target was replaced by such a link while it was read (symlinks that stay inside the repository are followed) |
| `instruction/import-cycle` | `warn` | Claude `@` import graph contains a cycle |
| `instruction/import-depth-exceeded` | `warn` | Claude `@` import exceeds the maximum hop depth |
| `instruction/import-size-exceeded` | `warn` | Claude `@` import expansion exceeded a size or graph limit (unique files, edges, emitted bytes, or per-file bytes). When a file has more `@` tokens than the limit (256 in one expansion, counting every token, including one that is not clearly a path), the message says `Too many @ tokens (the limit is 256)` and names the file |
| `instruction/discovery-limit-reached` | `warn` | Instruction file discovery stopped after listing the maximum number of directories (10,000) or examining the maximum number of directory entries (200,000), or did not go more than 10 directories deep. A depth stop inside an instruction location means `*.instructions.md` files in deeper directories were not analyzed. A depth stop of the nested-filename walk names `CLAUDE.md`, `AGENTS.md`, `AGENTS.MD`, and `agents.md` as what may be missing. Reported once per run, on the repository root |
| `instruction/discovery-symlink-skipped` | `warn` | Instruction file discovery skipped symbolic links that point outside the repository (an instruction filename such as `CLAUDE.md`, a file below an instruction directory, or an instruction directory), so their targets were not analyzed. A `vendor` or `docs` directory symlink is not reported. Reported once per run, on the repository root, naming up to five paths and counting the rest. Move or copy the target into the repository to have it analyzed |

The `instruction/missing-structural-heading` rule warns when an instruction file does not contain one or more of the following recommended heading sections: **Validation**, **Verification**, **Feedback Loop**, **Mandatory**, **Before Commit**, **Validation Suite**, **Commands**. These headings guide coding agents through validation and verification workflows. Because instruction files stack on each other across the filesystem, this rule fires per file and is a warning (not an error). For Claude entrypoints, headings are checked on the **effective** document after verified `@` imports are expanded (see [Claude shared-instruction imports](#claude-shared-instruction-imports)), so a thin wrapper that imports a shared file with those headings does not get false missing-heading warnings.

The **composite score** per command is the average of the three dimensions. The **overall quality score** (0–100%) is the average of all mandatory command composite scores. Suppressing missing-heading warnings via import expansion does **not** by itself change `overallQualityScore` — headings are diagnostic-only and are not a scoring dimension. Expansion can still change the score when imported content affects command-scoring rules (structural context, execution clarity, loop completeness) that consume the effective body.

### Claude shared-instruction imports

When `lint --instructions` analyzes a Claude entrypoint (`CLAUDE.md` format), it expands verified Claude `@` imports into a single **ordered effective document**, then runs content-sensitive instruction rules against that expanded body. Other instruction formats (Copilot, root `AGENTS.md`, custom agents) are analyzed as physical files only — no import expansion.

#### Token recognition

Only **verified native `@path` tokens** are imports:

- Match is a line-start `@` followed by a path. One tokenizer (`findImportTokens` in `@lousy-agents/core`) is shared by lint and doctor, so they agree on what an import is. A mention in the middle of a line (`see @AGENTS.md`, an email address) is not a token
- The path may be relative (`@./AGENTS.md`, `@../shared/rules.md`), a bare name (`@AGENTS.md`, which needs no `/`), absolute, or `~/`
- A backslash-escaped space stays in the path (`@./has\ space.md`); the path ends at the first unescaped space
- Quoted paths (`@"./a.md"`, `@'./a.md'`) are not imports, and neither is anything inside inline code or fenced code blocks
- A token that resolves to a file is an import. One that does not resolve is reported (`instruction/import-unresolved`) only if it **looks like a path**: it starts with `./`, `../`, `/` or `~/`, or its last path segment has a file extension. A line-start `@types/node` or `@no-such-thing` that resolves to nothing is left alone and produces no diagnostic. A token whose target the system would not let lint look at or open is reported even when it does not look like a path, because nothing is known about whether it exists; doctor reports it the same way, with the `unreadable` edge reason
- Limits of these rules: they were observed on Claude Code 2.1.316 in headless runs only (a bare `@AGENTS.md` and an escaped space load; an unescaped space, quoted, code-span and fenced forms do not; missing mentions are ignored silently), and subdirectories reached with `--directory` were not tested. Mid-line `@` tokens are documented by Claude Code but are not yet treated as imports here
- Markdown links (`[text](./file.md)`) are **not** imports

#### Ordered splice

A successful import is **spliced at the token position** in document order: content before the token, then the expanded import body (itself expanded recursively), then content after the token. Expansion is not a set-union of files and not append-at-end.

#### Path policy

Import targets resolve **relative to the importing file**, must stay **inside the repository root**, and must be **regular files**:

- Importer-relative resolution (`@./AGENTS.md` next to the importer)
- In-repo regular files only
- **Symlinks that stay inside the repository are followed**, for the final target and for intermediate directories, as Claude Code does (observed on Claude Code 2.1.316, headless: file symlinks, directory symlinks and chains all load, and a symlink that leaves the repository does not). Symlinks that resolve outside the repository are rejected (`instruction/import-symlink`)
- **A file is identified by its real path**: two symlinks to one file count once toward the unique-file limit, a symlink that leads back to a file already being expanded is an `instruction/import-cycle`, and `@` imports inside a symlinked file resolve relative to the target's real directory, not the symlink's (also observed on Claude Code 2.1.316)
- **The target must still be the file that was checked**: the opened file's identity is compared with the real path's identity recorded at check time, so a file swapped between the check and the read is rejected rather than read
- An absolute path **inside** the repository is a valid import (Claude Code loads it, observed on Claude Code 2.1.316). Absolute paths outside it, paths that leave the repository, and `~/` paths are external and are not expanded (`instruction/import-escape`)

#### Safety limits (internal defaults)

Limits are fixed internal defaults today (not configurable via CLI flags). They match the shipped expander defaults:

| Limit | Default |
| ----- | ------- |
| Max depth / hops | `4` (root entrypoint is hop `0`; the first import is hop `1`) |
| Max unique files | `64` |
| Max edges | `256` |
| Max emitted bytes | `512_000` |
| Max file bytes (per read) | `1_048_576` |

Exceeding a size/graph limit emits `instruction/import-size-exceeded`. When the effective document reaches the emitted-text limit (512,000 characters), the text that does not fit is left out of the analysis, and each file that lost text gets one `instruction/import-size-exceeded` diagnostic from the point where its text was cut, even if the file has no imports. A cut that loses only whitespace is not reported. Exceeding hop depth emits `instruction/import-depth-exceeded`.

Every file read during expansion is bounded and verified, not just size-checked up front. The file is opened without following a symbolic link at the final path component, the open file descriptor must be a regular file with a single hard link (a hard-linked target is refused as defense in depth, because a hard link can alias a file outside the repository) and no more than the per-file byte limit, and at most that limit plus one byte is read, so a file that grows after it was measured cannot make a read unbounded. A file that fails these checks is reported as an unresolved import (or `instruction/import-size-exceeded` when too large) and never aborts the analysis. The same reader reads a Claude entrypoint (`CLAUDE.md`, `.claude/CLAUDE.md`), so an entrypoint with more than one hard link is refused too and reported as `instruction/parse-error`. An instruction file that is not a Claude entrypoint (`AGENTS.md`, a Copilot instruction file) is read for analysis by a reader that refuses a symbolic link and a file over the size limit but not a hard link, so `ln CLAUDE.md AGENTS.md` leaves `AGENTS.md` analyzed and `CLAUDE.md` refused. The MCP tool `validate_instruction_coverage` reads every discovered file with the stricter check, and reports a hard-linked file as an `instruction/parse-error` entry in its `diagnostics`. Line and column positions for import diagnostics come from the same bounded read; when an importer can no longer be read safely, its diagnostics fall back to line 1, column 1.

#### Branch-local failures

Import failures are **branch-local**: a failed edge stays unexpanded (the original `@path` token remains in the effective text for that edge), and independent valid edges on the same file or elsewhere in the graph continue to expand. Cycles, missing targets, escapes, symlinks, and limit hits do not abort the whole analysis.

#### Provenance and output

- **Diagnostics** for import failures point at the **owning physical importer file** and the token location (line/column when available), not a synthetic effective path. CLI `--format json` / `rdjsonl` emit those diagnostics only (no quality-result envelope)
- **MCP** `analyze_instruction_quality` (and the in-memory library `InstructionQualityResult`) include additive `effectiveDocuments` when Claude entrypoints were expanded. Each entry has:
  - `effectiveRoot` — absolute path of the Claude entrypoint
  - `resolvedImports` — absolute paths of successfully resolved import targets (first-seen order)
- **Human CLI** prints a resolved-import count per expanded entrypoint using the absolute effective root, for example: `/repo/CLAUDE.md: 1 resolved import(s)`

#### Non-goals

- No hierarchical merge simulation for Codex, OpenCode, Pi, or other multi-file instruction stacks
- Copilot `@` references are deferred (not expanded)
- Markdown links are not imports
- Only verified native `@path` tokens outside code spans/fences participate
- Limits are not exposed as user-facing CLI flags

#### Coach-style wrapper pattern

A common pattern is a thin Claude entrypoint that imports shared instructions:

```markdown
@./AGENTS.md
```

When `AGENTS.md` already has the recommended structural headings, `instruction/missing-structural-heading` is evaluated on the expanded effective document, so the thin `CLAUDE.md` wrapper does **not** get false missing-heading warnings. Shared body content also participates in command-quality scoring through the same effective document.

### Examples

#### Instruction Analysis Output

```
Discovered 2 instruction file(s)
  .github/copilot-instructions.md (copilot-instructions)
  CLAUDE.md (claude-md)
  /repo/CLAUDE.md: 1 resolved import(s)
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

### Run-level warnings

reviewdog's default `filter_mode: added` drops any finding that is not on a changed line. A few diagnostics describe the whole run rather than a place in a file, such as `instruction/discovery-limit-reached` (instruction discovery stopped at a limit) and `instruction/discovery-symlink-skipped` (instruction discovery skipped symbolic links that point outside the repository), and they would never show up on a pull request. The action therefore publishes each of these on two channels of its own, outside reviewdog:

- **A workflow annotation.** The action's stdout is reviewdog's input, so lint writes the `::warning title=<rule id>::<message>` commands to `$RUNNER_TEMP/lousy-agents-annotations` and the composite step replays that file on stdout when it ends (an `EXIT` trap, so it also runs when lint exits non-zero and `pipefail` fails the step), which is where the runner reads workflow commands. Message and title are escaped the way the runner reads them, so a message cannot split or inject a command. The file is removed at the start of each run, so a second run of the action in the same job does not replay stale annotations. The path comes in through `LOUSY_AGENTS_ANNOTATIONS_FILE` and must be absolute, inside `RUNNER_TEMP`, and free of `..` segments; lint also refuses to write through a symlink at it.
- **The job summary.** The same warnings are appended to `$GITHUB_STEP_SUMMARY` as a short section. The summary escapes Markdown, HTML, math and autolinks (a URL, a `www.` address, an email address), so a path in a message, which a pull request's author can choose, is shown as literal text and cannot render as a link, an image or a formula.

The same diagnostic is still in the rdjsonl that reviewdog receives, so a `filter_mode` of `nofilter` or `file` also reports it as a check annotation. Neither channel changes the action's exit status. Run outside the action (no annotations file configured), the commands are written to stderr instead.

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
