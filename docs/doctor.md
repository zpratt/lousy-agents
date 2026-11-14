# `doctor` Command

`doctor` inventories agentic constructs across coding-agent harnesses, classifies how the repository is composed, and evaluates known preconditions. Multi-harness repos often leave people in the dark about what each agent loads and how instruction files reference each other. We built doctor so that map is observable in one command, human or JSON.

Primary entry:

```bash
npx @lousy-agents/cli doctor
```

The implementation package is `@lousy-agents/agentic-doctor` (bin: `agentic-doctor`) inside this monorepo. It is **not** published to the public npm registry today. Use `@lousy-agents/cli doctor` for installable runs.

## Features

- **Multi-harness inventory**: Scans Claude Code, GitHub Copilot, Codex, and other known harness footprints for instructions, skills, agents, subagents, hooks, plugins, and MCP servers.
- **Composition edges**: Records hard-imports (`@path`), soft-references (markdown links and frontmatter `see:` / `references:` / `requires:`), and Copilot `applyTo` glob-bindings, including a `crossHarness` flag when the target belongs to a different harness.
- **Archetype classification**: Labels the repo as `pure`, `intentional-hybrid`, `canonical-contract`, `accidental-sprawl`, `none`, or `ambiguous` so fleet drift is visible without reading every config file.
- **Criteria evaluation**: Grades missing required files, malformed references, wrong-direction cross-harness links, sprawl, and missing declared intent.
- **Machine-readable JSON**: Emits the full inventory and edge graph for CI, reviewer agents, and handoff artifacts.
- **Non-interactive CI mode**: `--ci` skips prompts so doctor is safe in pipelines.

## How It Works

1. Scan the current working directory for harness footprints and composition edges.
2. Classify the repository archetype and compute harness dominance.
3. Load optional declared intent from `.agentic-doctor/intent.json` in the current working directory, and record whether it loaded or why it was rejected (see [Intent load status](#intent-load-status)).
4. For human output on an interactive TTY without `--ci`, optionally ask short ambiguity questions when no intent file exists (status `absent`). JSON output never prompts, so stdout is always a single JSON document. A present-but-rejected file is reported instead of prompting. Answers are only acknowledged (`Noted.`); they are **not** written to disk and **do not** change findings for that run. Doctor re-reads `.agentic-doctor/intent.json` afterward in case you created it in another terminal.
5. Evaluate the criteria catalog against inventory, archetype, and intent.
6. Print a human report or JSON. Exit `1` when any **critical** or **high** finding is classified as a **defect**. When the archetype is `none`, human mode prints that no agentic constructs were found and skips the full findings layout, and the command exits `0`.

This is a tight feedback loop for multi-agent work: inventory what the fleet can see, name the composition pattern, fail CI only on blocking defects.

## Options

| Flag | Type | Default | Description |
| ------ | ------ | --------- | ------------- |
| `--summary` | boolean | `false` | Show archetype classification only. Skips criteria evaluation. JSON still includes `inventory`. `--summary` takes precedence over the no-constructs case: a repository with no agentic constructs still reports `evaluation: "skipped"`, not `not-applicable`. |
| `--format` | `human` \| `json` | `human` | Output format. Any value other than `json` is treated as `human`. The comparison is exact, so `JSON` is not `json`. An unsupported value also prints a warning to stderr that names the accepted values, so a typo never goes unnoticed; the exit code is unchanged, and doctor does not ask intent questions on that run. |
| `--ci` | boolean | `false` | Force non-interactive mode. Skips intent elicitation prompts. JSON output is always non-interactive. |

## Usage

### Basic usage

Run from your project root:

```bash
npx @lousy-agents/cli doctor
```

Human output opens with archetype, dominance score, harness breakdown, and optional cross-harness edge count, then lists findings ordered by severity.

### Summary only

```bash
npx @lousy-agents/cli doctor --summary
```

Use this when you only need the composition label before a deeper pass. `--summary` skips criteria evaluation, so the process exit code stays `0` even when a full run would report blocking defects.

### JSON for agents and automation

```bash
npx @lousy-agents/cli doctor --format json --ci
```

JSON is the surface for reviewer agents, fleet aggregation, and storing a composition snapshot next to a PR.

### After parallel agent waves

1. Run `npx @lousy-agents/cli doctor --format json --ci` as the composition referee (archetype, edges, blocking defects).
2. Run `npx @lousy-agents/cli lint` for file-quality diagnostics on shared discovery paths.
3. Promote durable defects into shared law (`AGENTS.md`, `CLAUDE.md`, `.agentic-doctor/intent.json`) so the next wave inherits the constraint.

### Help

```bash
npx @lousy-agents/cli doctor --help
```

## What It Inventories

Doctor attributes each construct to a harness (`claude`, `copilot`, `codex`, `antigravity`, `hermes`, `crush`, `pi`, or `shared`) and a construct type:

| Construct type | Examples |
| -------------- | -------- |
| `instruction` | `CLAUDE.md` and `AGENTS.md` at the root or in subdirectories (`AGENTS.MD` and `agents.md` too), `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md` |
| `skill` | `.claude/skills/`, `.github/skills/`, `.agents/skills/`, `.pi/skills/` |
| `agent` | `.github/agents/**/*.md`, `.claude/commands/` |
| `subagent` | `.claude/agents/**/*.md` |
| `hook` | `.claude/settings.json`, `.github/hooks/` |
| `mcp-server` | One record per server declared in `.mcp.json` or `.vscode/mcp.json` |
| `plugin` | Plugin manifests under known plugin roots |

Paths come from the shared agentic location catalog in `@lousy-agents/core` (the same catalog [lint](lint.md) uses). Doctor may inventory constructs lint does not validate yet.

**MCP notes:**

- JSON sources are enumerated (for example `.mcp.json` attributed as `shared`, `.vscode/mcp.json` as `copilot`).
- VS Code-style configs that use a top-level `servers` key are recognized.
- Codex TOML `[mcp_servers.*]` in `.codex/config.toml` is not enumerated yet.

**Filesystem notes:**

- `CLAUDE.md` and `AGENTS.md` (also `AGENTS.MD` and `agents.md`) are inventoried at any directory depth, not only at the repository root. Copies under `node_modules`, `.git`, `dist`, `tests/fixtures`, `__fixtures__`, or `testdata` stay out, because the walk does not enter those directories. A `fixtures` directory that is not the child of `tests`, such as `src/fixtures`, is scanned. The directory doctor was started in is always scanned, so a run whose root is `tests/fixtures` or one fixture case still inventories that tree. A run whose root is a directory named `tests` still skips a child named `fixtures`, using that root name as the parent of the pair. A copy inside a directory another harness already claims, such as `.github/agents/CLAUDE.md`, keeps that harness. Lint discovers those same filenames, including `AGENTS.MD` and `agents.md`, with a walk that starts at the repository root and lists a directory when its segment count is at most 10, the same cap as this scan. A `CLAUDE.md` nine directories below `.github/instructions` has a parent of 11 segments, so both tools leave it out. `CLAUDE.md` and `AGENTS.md` under `.github/instructions/` are Claude and shared instructions for lint as well. A copy inside a skill directory, such as `.claude/skills/example/AGENTS.md`, is not an `agents-md` instruction. On the trees lint walks, it skips the same fixture directories and `dist`.
- Doctor follows in-repo symlinks when inventorying instruction files (common when teams symlink `AGENTS.md`).
- Symlinks that escape the repository root are rejected.
- A relative `@import` inside a symlinked file resolves from the **real target's directory**, not the symlink's. For `CLAUDE.md -> docs/agents/REAL.md` containing `@./guide.md`, the import is `docs/agents/guide.md`. This is how Claude Code resolves it (observed on Claude Code 2.1.316), and it is the same rule `lint` uses, through the same core resolver.
- Lint skips symlinked skill, agent and hook targets by design; that difference is intentional. Instruction files and their `@` imports follow in-repo symlinks in lint too.
- Doctor walks the repository with the same bounded walk as lint's instruction discovery (`@lousy-agents/core`). It skips `node_modules`, `.git` and `dist`, and it does not enter `tests/fixtures`, `__fixtures__`, or `testdata` directories it meets during the walk. Lint skips those same directories on the instruction, agent, and skill trees it walks, and on the root walk that looks for `CLAUDE.md`, `AGENTS.md`, `AGENTS.MD`, and `agents.md`. Doctor lists entries in UTF-16 code-unit order of their names (so the inventory order is the same on every machine, whatever its locale), lists directories through depth 10 (the root is depth 0), and stops listing after 10,000 directories or 200,000 directory entries. Lint's `*.instructions.md` walk starts at each instruction location instead, so a `*.instructions.md` many directories below `.github/instructions` can be linted while doctor, counting depth from the repository root, does not enter it. Lint's filename walk uses that same root depth, so a `CLAUDE.md` past it is out for both tools.
- A directory doctor cannot list, or an entry it cannot inspect (permission denied, a symlink loop, too many open files), is skipped without a finding and the walk goes on, as in lint. A run as a user who cannot read a directory inventories less than a run that can, and does not say so.
- **Doctor lists every location, lint lists every real file once.** If `.claude/skills` is a symlink to `.agents/skills`, doctor inventories both `claude:.claude/skills/...` and `codex:.agents/skills/...`, because different harnesses load each location. A symlink back to one of its own ancestors is refused, so a cycle terminates. Lint's instruction discovery lists a real directory once, under the first path in name order. When comparing the two tools, compare by real file.
- **Doctor does not detect import cycles; lint does.** Doctor judges each `@` import on its own, so a file that imports itself, or two files that import each other, give well-formed edges in the doctor report, where lint reports `instruction/import-cycle`. An edge from a file to itself does not count as a reference to it, so a file whose only importer is itself is not marked `referenced`.
- When the 10,000-directory limit is reached, or a directory lies below the depth limit of 10 and is not entered, or the walk has examined 200,000 directory entries (the work a fan-out of directory aliases costs, which the directory cap does not bound), doctor keeps what it found and adds the advisory `discovery-limit-reached` finding (see below), once however many limits were reached; the inventory may be missing constructs in the remaining or deeper directories.
- When the walk skips a symbolic link that would have been scanned but points outside the repository (the policy stays: such a link is not followed), doctor adds the advisory `discovery-symlink-skipped` finding (see below) once, naming up to five of the links and counting the rest, as lint does with `instruction/discovery-symlink-skipped`. Doctor's notice is wider than lint's: it covers any symbolic link in the repository that would have been scanned, not only an instruction filename, a file below an instruction directory, or an instruction directory. A `vendor` or `docs` directory symlink that points outside the repository is not in lint's warning.
- Doctor resolves at most 256 `@` imports per file. Lint's 256 is a budget for the whole expansion of each entrypoint, across every file it reaches, so the number matches but the scope does not. Doctor counts every `@` token, including one that is not clearly a path. When a file has more, the imports after the 256th are not in the report and doctor adds the advisory `import-limit-reached` finding (see below) once, naming up to five of the files. Each distinct import target is checked once however many imports name it, and at most 64 are checked at a time, so a file full of imports cannot run the process out of file descriptors. A target the system will not open (too many open files, access denied) or that changed while it was being read gets the `unreadable` edge reason, never `missing-target`; lint classifies it the same way and reports "could not be read". The cost of resolving a repository's imports is the per-file cap times the number of files, and the checks waiting for a slot are taken in a queue whose work does not grow with its length.
- When doctor cannot read a markdown file that a harness owns (it has more than one hard link, is over 1 MiB, or the system would not open it), it adds the advisory `instruction-file-unread` finding (see below) once, naming up to five of the files and counting the rest. The imports and links in that file are not in the report. Lint reports a discovered instruction file it cannot open or that is over 1 MiB as `instruction/parse-error`. It refuses a hard-linked file for every file discovered as `claude-md`, including a nested `CLAUDE.md`, so a hard-linked `AGENTS.md` or Copilot instruction file is analyzed by lint and reported by doctor. Lint does not check skills or agents for this; doctor does.
- **Doctor judges direct `@` imports in `claude`-harness files only; lint expands them transitively** (see [lint](lint.md#discovery-limits), *Differences from doctor*).

## Archetypes

| Archetype | Meaning |
| --------- | ------- |
| `pure` | One non-shared harness dominates (share ≥ 80%) and there are no cross-harness edges. |
| `intentional-hybrid` | Multiple harnesses are present and at least one non-malformed, non-glob cross-harness edge exists. |
| `canonical-contract` | Only `shared` harness constructs were found (for example a shared contract file read by multiple tools). |
| `accidental-sprawl` | Multiple harnesses are configured without cross-harness references. |
| `none` | No agentic constructs found. |
| `ambiguous` | Detection includes harnesses whose footprints still need verification, or the shape does not fit cleanly. |

Dominance score is the top harness share of weighted inventory (records plus edges). Treat archetype as a fleet signal: after parallel agent runs, a flip from `intentional-hybrid` to `accidental-sprawl` means shared references were lost or never existed.

## Criteria reference

Findings carry `severity`, `classification` (`defect` \| `advisory` \| `info`), and a stable `criterionId`.

**Blocking rule:** process exit code is `1` only when a finding is both:

- `severity` of `critical` or `high`, and
- `classification` of `defect`

Advisories never fail the process on their own. Medium defects (for example missing intent) appear in the report but do not set exit code `1`.

| Criterion ID | Harness | Severity | Classification | Category | What it means |
| ------------ | ------- | -------- | -------------- | -------- | ------------- |
| `missing-copilot-instructions` | copilot | critical | defect | missing-required | `.github/copilot-instructions.md` is missing while Copilot constructs are present (for example `.github/instructions/`). Blocks CI. |
| `missing-claude-md` | claude | high | defect | missing-required | Neither a `CLAUDE.md` (at the root or in a subdirectory) nor `.claude/` is present while the Claude harness is attributed. In practice Claude is usually detected only via those paths, so this finding is rare. |
| `missing-agents-md` | codex | high | defect | missing-required | Neither `AGENTS.md` nor `AGENTS.override.md` is present while Codex is attributed (for example via `.agents/skills/` or `.codex/`). Blocks CI. |
| `malformed-claude-import` | claude | high | defect | malformed-reference | A Claude `@path` hard-import points to a file inside the repository that does not exist (edge reason `missing-target`). Blocks CI. Imports that resolve outside the working directory are not defects; see `external-claude-import`, and imports lint refuses to read are not defects either; see `unread-claude-import`. |
| `unread-claude-import` | claude | medium | advisory | malformed-reference | A Claude `@path` hard-import points to a file inside the repository that lint and doctor do not read, for the same reasons lint's import expansion refuses it: a directory or other file that is not regular, such as a named pipe or a symbolic link that loops (edge reason `not-regular`), a file with more than one hard link (`hard-link`), a file over 1 MiB (`too-large`), or a file the system would not open or that changed while it was being read, such as when the process has run out of file descriptors or is denied access (`unreadable`). A target that could not be read is never reported as missing. Visible, never blocks CI. |
| `external-claude-import` | claude | medium | advisory | malformed-reference | A Claude `@path` hard-import resolves outside the working directory: a `~/` path, an absolute path outside the repository, or a `../` path that leaves it, or a symlink whose real target is outside the repository (edge reasons `home`, `absolute`, `path-traversal`, `symlink-outside`; lint reports the symlink as `instruction/import-symlink`). One finding per import, naming its path. Claude Code loads such an import only after a one-time approval in an interactive session; in headless, `-p` or CI runs it was not loaded in testing (Claude Code 2.1.316, absolute path outside the working directory). **The `~/` case is docs-based and was not observed in testing.** Visible, never blocks CI. An absolute path *inside* the repository is a valid import and produces no finding. |
| `cross-harness-drift` | all | high | advisory | drift | Archetype is `accidental-sprawl`: multiple harnesses with no cross-harness references. Does not block CI. |
| `wrong-direction-copilot-imports-claude` | copilot | medium | advisory | wrong-direction | A Copilot file uses Claude `@path` hard-import syntax toward a Claude file. Copilot does not process `@path` hard-imports. |
| `wrong-direction-copilot-links-claude` | copilot | medium | advisory | wrong-direction | A Copilot file soft-references a Claude file (markdown link or frontmatter `see:` / `references:` / `requires:`). Copilot CLI does not follow those links. |
| `discovery-limit-reached` | all | medium | advisory | governance | The scan stopped after listing 10,000 directories or examining 200,000 directory entries, or did not go more than 10 directories deep, so constructs in the remaining or deeper directories are not in the report. Reported once, on target `all:repository`. Visible, never blocks CI. In `--summary --format json` it is written to stderr, because that output has no findings. |
| `discovery-symlink-skipped` | all | medium | advisory | governance | The scan skipped symbolic links that point outside the repository, so their targets are not in the report. Names up to five of the links and counts the rest. Reported once, on target `all:repository`. Visible, never blocks CI. |
| `import-limit-reached` | all | medium | advisory | governance | Some files had more than 256 `@` imports, the number lint expands, and only the first 256 of each were checked, so the imports after them are not in the report. Names up to five of the files and counts the rest. Reported once, on target `all:repository`. Visible, never blocks CI. |
| `instruction-file-unread` | all | medium | advisory | governance | The scan could not read some markdown files a harness owns (an instruction file, a skill or an agent; a file with more than one hard link, a file over 1 MiB, or one the system would not open), so the `@` imports and links they hold are not in the report. Names up to five of the files and counts the rest. Reported once, on target `all:repository`. Visible, never blocks CI. |
| `missing-intent-artifact` | all | medium | defect | governance | Constructs exist but no file exists at `.agentic-doctor/intent.json` in the directory doctor ran from. Visible, non-blocking. |
| `invalid-intent-artifact` | all | medium | defect | governance | Constructs exist and `.agentic-doctor/intent.json` exists but was rejected (invalid JSON, schema mismatch, symlink, or unreadable). The intent status names the reason. Visible, non-blocking. |
| `missing-hermes-config` | hermes | medium | advisory | missing-required | Hermes is attributed (for example via `SOUL.md`) without `.hermes.md` or `HERMES.md`. |
| `missing-crush-config` | crush | medium | advisory | missing-required | Crush is attributed (for example via `.crush/`) without `crush.json`. |

Missing-required checks run only when that harness already appears in the inventory. They fire when the harness was detected through a path other than the required entry file (Copilot via `.github/instructions/` is the common critical case).

Use findings as referee input for humans and review agents. Feed durable ones into shared rules (`AGENTS.md`, `CLAUDE.md`) so the next wave of agents inherits the constraint.

## Doctor vs lint

Doctor and lint share the discovery catalog. They answer different questions:

| Concern | doctor | lint |
| ------- | ------ | ---- |
| Question | What agentic surface exists, how does it compose, and which preconditions fail? | Are discovered construct files well-formed and high quality? |
| When (typical) | First after parallel agent waves: composition referee before merge | Second: structural quality on the paths both tools share |
| Output | Archetype, inventory, edges, criteria findings | Rule diagnostics with line numbers |
| CI role | Composition and missing-required gates | Structural validation gates |
| Symlinks | Follows in-repo targets | Skips symlinked skill, agent and hook targets; follows in-repo symlinks for instruction files and `@` imports |
| Coverage | Broader inventory (plugins, multi-harness trees, MCP servers as inventory records) | Validates skills, agents, hooks, instructions by default; subagents and MCP are flag-only |

See [lint](lint.md) for validation rules, rollout status, and flag-only targets. Doctor finds the map; lint grades file quality on the paths both tools share.

## Output formats

### Human (default)

When there are no findings:

```
Archetype: intentional-hybrid
  Multi-harness configuration with cross-harness references. Harnesses deliberately share context.
  Dominance score: 41%
  Total records: 59
  Harness breakdown:
    antigravity: 1
    claude: 26
    codex: 23
    copilot: 8
    shared: 1
  Cross-harness edges: 1
Intent: loaded
  Checked path: /path/to/repo/.agentic-doctor/intent.json
✔ No findings.
```

Human output never lets repository content reshape the report. Text that comes from the repository (the evidence snapshot reference, the intent section's checked path, reason, and issue paths and messages, and the node id and source file of a finding's evidence citation) is escaped before it is printed. Line breaks and tabs appear as `\n`, `\r`, and `\t`. A literal backslash appears as `\\`, so repository text cannot imitate an escape sequence. Every other control character appears as a `\uXXXX` escape: C0 controls, DEL, C1 controls such as the `0x9b` CSI introducer, the Unicode line and paragraph separators U+2028 and U+2029, and invisible format characters such as zero-width characters, bidirectional controls and the byte order mark (Unicode category Cf; characters beyond U+FFFF appear as `\u{XXXXX}`). A hostile file name or intent field therefore cannot forge a report line or send terminal control sequences. JSON output is serialized as JSON and is not escaped this way.

When the intent file is present but rejected, the intent section names the reason and, for schema mismatches, each failing field:

```
Intent: invalid-schema
  Checked path: /path/to/repo/.agentic-doctor/intent.json
  Reason: The file does not match the intent schema.
  Issues:
    targetHarnesses.1: Invalid option: expected one of "claude"|"copilot"|"codex"|"antigravity"|"hermes"|"crush"|"pi"|"shared"
```

When findings exist (header plus severity-ordered lines):

```
Findings (2):
  [HIGH][advisory] cross-harness-drift: Multiple AI harnesses are configured but share no cross-harness references. This may indicate accidental configuration sprawl rather than intentional multi-harness setup.
  [MEDIUM][defect] missing-intent-artifact: No declared intent artifact found at .agentic-doctor/intent.json in the directory doctor ran from. All shipped checks still ran, and this finding alone does not fail the command. Doctor does not search parent or home directories, and declared intent does not change the detected archetype. [assumed intent]
```

Tags are `[SEVERITY][classification]`. Findings with `assumedIntent: true` append `[assumed intent]`. Optional evidence citations print on the following line when present.

### JSON

`--format json` emits a Zod-validated report. Existing aggregate keys stay stable; `inventory` and `edges` are additive. Stdout carries only that report: every log level, including the debug lines that `DEBUG=1` enables, goes to stderr, so `doctor --format json | jq` stays valid.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `archetype` | string | One of the archetype values above |
| `dominanceScore` | number | Top harness share, 0–1 |
| `totalRecords` | number | Length of inventory |
| `harnessBreakdown` | `{ harness, count }[]` | Sorted by harness name |
| `crossHarnessEdges` | number | Count of edges with `crossHarness: true` |
| `evaluation` | `completed` \| `skipped` \| `not-applicable` | `completed` on a full run; `skipped` with `--summary`; `not-applicable` when the archetype is `none`, because there was nothing to evaluate. Only `completed` with an empty `findings` array means the criteria ran and found nothing, so never read an absent or empty `findings` array as a clean result without checking `evaluation`. |
| `inventory` | array | One entry per construct |
| `edges` | array | Flattened composition edges |
| `intent` | object | Intent load status: `{ status, checkedPath, reason?, issues?, omittedIssueCount? }`. Present only on full evaluate (not on `--summary` or when the archetype is `none`). See [Intent load status](#intent-load-status). |
| `findings` | array | Criteria results (empty array when none). Present only on full evaluate, not on `--summary`. |
| `snapshotRef` | string? | Present when a local `wisdom/` graph is available |

**Inventory item fields:** `id`, `path`, `harness`, `constructType`, `loadMechanism` (`referenced` \| `convention-loaded`), optional `serverName` / `transport` for `mcp-server` records.

**Edge fields:** `from`, `to`, `type` (`hard-import` \| `soft-reference` \| `glob-binding`), `malformed`, optional `reason` (`missing-target`, or `path-traversal`, `home`, `absolute`, `symlink-outside` for an import that resolves outside the working directory, or `not-regular` (a directory, a named pipe, a symbolic link that loops), `hard-link`, `too-large` for an import target lint refuses to read, or `unreadable` for one the system would not open or that changed while it was being read; both tools classify an import target with the same mapping, so neither reports an unreadable target as missing, and a path that exists but is not a regular file is never reported as missing; a path the system cannot represent (too long, or containing a NUL byte) cannot name a file, so it is `missing-target`). A line-start `@` token that resolves to nothing and does not look like a path (for example `@types/node`) produces no edge at all, and a bare `@AGENTS.md` is a normal import; the tokenizer is the same one lint uses, see [lint](lint.md#token-recognition), `crossHarness` (boolean; always set).

**Finding fields** (full evaluate only):

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | string | Stable id, usually `criterionId:targetId` |
| `criterionId` | string | Matches the criteria table |
| `targetId` | string | What was graded: `all:intent`, `all:<archetype>` (drift), `all:repository` (discovery limit), `harness:all`, or a harness pair |
| `severity` | `critical` \| `high` \| `medium` \| `low` \| `info` | Ordering key in human output |
| `category` | string | `missing-required`, `malformed-reference`, `wrong-direction`, `drift`, `governance`, or `composition-style` |
| `classification` | `defect` \| `advisory` \| `info` | Only `defect` can block CI when severity is critical/high |
| `intentGated` | boolean | Reserved for intent-gated checks (none active in the shipped catalog) |
| `assumedIntent` | boolean | `true` when the finding assumes missing intent (for example `missing-intent-artifact`) |
| `description` | string | Human-readable explanation |
| `evidenceCitation` | object? | Optional `{ nodeId, sourceFile, lineRange?, snapshotRef? }` |
| `snapshotRef` | string? | Optional evidence pin on the finding |

`crossHarness` is `true` only when the edge is not malformed, type is not `glob-binding`, and the resolved target path maps to a known record on a different harness. The `crossHarnessEdges` count uses the same predicate.

Reviewer agents can filter without re-scanning source:

- Blocking gate set: `findings.filter(f => (f.severity === "critical" || f.severity === "high") && f.classification === "defect")`
- Drift signal: `archetype`, `crossHarnessEdges`, and advisories with `criterionId === "cross-harness-drift"`

Example fragment from an `accidental-sprawl` repo (no cross-harness edges, no intent file). High advisory does not fail CI; medium defect does not fail CI either:

```json
{
  "archetype": "accidental-sprawl",
  "dominanceScore": 0.5,
  "totalRecords": 2,
  "harnessBreakdown": [
    { "harness": "claude", "count": 1 },
    { "harness": "copilot", "count": 1 }
  ],
  "crossHarnessEdges": 0,
  "evaluation": "completed",
  "inventory": [
    {
      "id": "copilot:.github/copilot-instructions.md",
      "path": ".github/copilot-instructions.md",
      "harness": "copilot",
      "constructType": "instruction",
      "loadMechanism": "convention-loaded"
    },
    {
      "id": "claude:CLAUDE.md",
      "path": "CLAUDE.md",
      "harness": "claude",
      "constructType": "instruction",
      "loadMechanism": "convention-loaded"
    }
  ],
  "edges": [],
  "intent": {
    "status": "absent",
    "checkedPath": "/path/to/repo/.agentic-doctor/intent.json",
    "reason": "No file exists at the checked path."
  },
  "findings": [
    {
      "id": "missing-intent-artifact:all:intent",
      "criterionId": "missing-intent-artifact",
      "targetId": "all:intent",
      "severity": "medium",
      "category": "governance",
      "classification": "defect",
      "intentGated": false,
      "assumedIntent": true,
      "description": "No declared intent artifact found at .agentic-doctor/intent.json in the directory doctor ran from. All shipped checks still ran, and this finding alone does not fail the command. Doctor does not search parent or home directories, and declared intent does not change the detected archetype."
    },
    {
      "id": "cross-harness-drift:all:accidental-sprawl",
      "criterionId": "cross-harness-drift",
      "targetId": "all:accidental-sprawl",
      "severity": "high",
      "category": "drift",
      "classification": "advisory",
      "intentGated": false,
      "assumedIntent": false,
      "description": "Multiple AI harnesses are configured but share no cross-harness references. This may indicate accidental configuration sprawl rather than intentional multi-harness setup."
    }
  ]
}
```

With `--summary`, JSON includes archetype fields, `evaluation: "skipped"`, and `inventory` only. It does not emit `edges` or `findings`, and it does not run criteria evaluation. Human output prints `Evaluation skipped (--summary).` instead of a findings section, so a summary never reads as a clean check.

## Declared intent

Optional artifact path: `.agentic-doctor/intent.json`.

**What the shipped evaluator does today:** if constructs exist and no file exists at the checked path, `missing-intent-artifact` fires as a **medium defect** (visible in the report, non-blocking for exit code). If a file exists but is rejected, `invalid-intent-artifact` fires instead, with the same severity. When the file is present and valid, neither finding fires. The engine can run `intent.capabilityDeclared` checks, but **no shipped criterion uses that check method yet**, so `targetHarnesses` and `desiredCapabilities` do not change findings in the current catalog. Treat the file as version-controlled posture for humans, reviewer agents, and future capability gates.

Schema fields:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `targetHarnesses` | string[] | Intended harnesses (`claude`, `copilot`, `codex`, `antigravity`, `hermes`, `crush`, `pi`, `shared`). Recorded posture; not read by shipped criteria. |
| `desiredCapabilities` | string[] | Capability ids you claim. Reserved for intent-gated criteria; none active in the shipped catalog. |
| `confirmedAnswers` | object | Free-form confirmed decisions (for example declared archetype rationale) |
| `intentSource` | `interactive` \| `ci-assumed` \| `pre-committed` | How the artifact was produced |
| `snapshotRef` | string? | Optional evidence snapshot pin |

Known capability id attached as metadata on a shipped criterion (for documentation and future gates): `copilot-workspace-instructions` on `missing-copilot-instructions`. Do not invent fleet-only capability strings and expect doctor to grade them today.

Example:

```json
{
  "targetHarnesses": ["copilot", "claude", "codex"],
  "desiredCapabilities": ["copilot-workspace-instructions"],
  "confirmedAnswers": {
    "archetype": "intentional-hybrid",
    "rationale": "Copilot, Claude Code, and Codex are intentional. CLAUDE.md hard-imports shared Copilot instructions."
  },
  "intentSource": "pre-committed"
}
```

### Intent load status

Every full run reports how the intent load went. Human output prints an `Intent:` section; JSON emits the same values in the `intent` object.

| `status` | Meaning | Finding |
| -------- | ------- | ------- |
| `loaded` | The file was read and matches the schema. | none |
| `absent` | No file exists at the checked path (including when `.agentic-doctor` is itself a regular file). | `missing-intent-artifact` |
| `invalid-json` | The file is not valid JSON. | `invalid-intent-artifact` |
| `invalid-schema` | The JSON does not match the schema. `issues` lists each field path and the expected value or type, up to 20; `omittedIssueCount` reports any beyond that. | `invalid-intent-artifact` |
| `symlink-rejected` | The file, or a directory on its path, is a symbolic link. | `invalid-intent-artifact` |
| `read-failed` | The path is not a regular file, is a hard link, exceeds the 64 KiB limit, or could not be read. `reason` names the cause. | `invalid-intent-artifact` |

Scope rules:

- `checkedPath` is always `<current working directory>/.agentic-doctor/intent.json`. Run doctor from the repository root. A run from a subdirectory checks that subdirectory.
- Doctor does not search parent directories or your home directory. A home-level intent file has no effect.
- The intent file must be a regular file. Unlike instruction scanning, which follows in-repository symlinks, intent loading rejects any symlink, even one inside the repository.
- Diagnostics never include the file's contents.

Commit the artifact when multi-harness posture is deliberate. That raises the floor for the next human or agent session: intent is shared law in git, not tribal knowledge in someone's terminal scrollback.

Interactive prompts on a TTY do not write this file, and yes/no answers are not applied to the in-memory intent for that run. Create or update `.agentic-doctor/intent.json` in source control yourself, then re-run doctor.

## Exit codes and CI

### CI contract

- Full evaluate (`doctor` or `doctor --format json`, without `--summary`) sets exit code `1` only when `hasBlockingFindings` is true: at least one finding with `severity` of `critical` or `high` **and** `classification` of `defect`.
- High **advisories** (for example `cross-harness-drift`) never fail the process on their own, and neither do the advisories `discovery-limit-reached`, `discovery-symlink-skipped`, `import-limit-reached`, `instruction-file-unread`, `external-claude-import` and `unread-claude-import`.
- Medium **defects** (for example `missing-intent-artifact`) appear in the report and do not set exit code `1`.
- A repository with no agentic constructs exits `0`. Its JSON report says `evaluation: "not-applicable"`, so a pipeline can tell "nothing to check" from "checked and clean" (`completed`).
- `--summary` skips evaluate. Exit code stays `0`. Use it for composition snapshots, not as a merge gate.
- Prefer writing JSON to a file in the same step that gates, so the step exit code is doctor's exit code (avoid bare pipes that drop status unless `pipefail` is on).

| Exit code | When |
| --------- | ---- |
| `0` | No blocking findings, or `--summary` (no evaluate), or no agentic constructs were found (the archetype is `none`, so nothing was evaluated) |
| `1` | At least one critical or high **defect** on a full evaluate |
| `2` | Returned only by the exported `runDoctorCommand` when it is given invalid options, for example a non-boolean `summary` or `ci`. Nothing is written to stdout. The command line never exits `2`: its parser coerces the boolean flags, and an unsupported `--format` value warns and falls back to `human`. |

Gating step (fails the job on blocking defects, keeps the report). Redirect does not hide doctor's exit code:

```yaml
- name: Agentic configuration doctor
  run: npx @lousy-agents/cli doctor --format json --ci > doctor-report.json
```

Example: a repo with Copilot instruction fragments under `.github/instructions/` but no `.github/copilot-instructions.md` exits `1` on full evaluate (`missing-copilot-instructions` is a critical defect). The same repo with `--summary` still exits `0`.

Non-gating composition snapshot for PR artifacts or fleet baselines (always exit `0` from doctor):

```yaml
- name: Doctor summary artifact
  run: npx @lousy-agents/cli doctor --summary --format json --ci > doctor-summary.json
```

Fleet pattern without a productized aggregator: store `doctor-report.json` or `doctor-summary.json` per PR, then diff `archetype`, `crossHarnessEdges`, and blocking `criterionId` values over time.

After parallel agent runs on different directories, run full doctor before merge. Use archetype, `crossHarnessEdges`, and blocking defects as an independent referee beside tests and human review.

## Limits (work in progress)

We are honest about what is Partial today:

- Codex MCP servers declared only in TOML are not inventoried yet.
- Intent write-back from interactive prompts is not implemented; prompt answers are discarded after `Noted.` Commit `.agentic-doctor/intent.json` yourself.
- `@lousy-agents/agentic-doctor` is not on the public npm registry yet; installable entry is `@lousy-agents/cli doctor`.
- Shipped criteria do not yet gate on `desiredCapabilities` or `targetHarnesses` beyond presence of the intent file.
- Human output summarizes findings; the full inventory and edge graph are JSON-only.
- Harness depth is uneven. Copilot and Claude are strongest; other footprints are thinner.
- Optional `snapshotRef` requires a local `wisdom/` graph. Runs succeed without it.
- Lint does not validate every construct doctor can inventory. See [lint rollout status](lint.md#rollout-status).

## Related docs

- [lint](lint.md): shared catalog, construct validation, flag-only subagents and MCP
- [Agent Lessons](lessons.md): durable session knowledge under `.lousy-agents/lessons/`
- [MCP Server](mcp-server.md): `@lousy-agents/mcp` tools for assistants
- [agent-shell](../packages/agent-shell/README.md): npm script telemetry and policy hooks
- [@lousy-agents/agentic-doctor](../packages/doctor/README.md): package landing page
