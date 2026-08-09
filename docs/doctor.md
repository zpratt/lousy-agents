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
3. Load optional declared intent from `.agentic-doctor/intent.json`.
4. On an interactive TTY without `--ci`, optionally ask short ambiguity questions when intent is missing. Answers are only acknowledged (`Noted.`); they are **not** written to disk and **do not** change findings for that run. Doctor re-reads `.agentic-doctor/intent.json` afterward in case you created it in another terminal.
5. Evaluate the criteria catalog against inventory, archetype, and intent.
6. Print a human report or JSON. Exit `1` when any **critical** or **high** finding is classified as a **defect**. When the archetype is `none`, human mode prints that no agentic constructs were found and skips the full findings layout.

This is a tight feedback loop for multi-agent work: inventory what the fleet can see, name the composition pattern, fail CI only on blocking defects.

## Options

| Flag | Type | Default | Description |
| ------ | ------ | --------- | ------------- |
| `--summary` | boolean | `false` | Show archetype classification only. Skips criteria evaluation. JSON still includes `inventory`. |
| `--format` | `human` \| `json` | `human` | Output format. Any value other than `json` is treated as `human`. |
| `--ci` | boolean | `false` | Force non-interactive mode. Skips intent elicitation prompts. |

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
| `instruction` | `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/*.md` |
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

- Doctor follows in-repo symlinks when inventorying instruction files (common when teams symlink `AGENTS.md`).
- Symlinks that escape the repository root are rejected.
- Lint skips symlinks by design. That difference is intentional.

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
| `missing-claude-md` | claude | high | defect | missing-required | Neither `CLAUDE.md` nor `.claude/` is present while the Claude harness is attributed. In practice Claude is usually detected only via those paths, so this finding is rare. |
| `missing-agents-md` | codex | high | defect | missing-required | Neither `AGENTS.md` nor `AGENTS.override.md` is present while Codex is attributed (for example via `.agents/skills/` or `.codex/`). Blocks CI. |
| `malformed-claude-import` | claude | high | defect | malformed-reference | A Claude `@path` hard-import is malformed (missing target or path traversal). Blocks CI. |
| `cross-harness-drift` | all | high | advisory | drift | Archetype is `accidental-sprawl`: multiple harnesses with no cross-harness references. Does not block CI. |
| `wrong-direction-copilot-imports-claude` | copilot | medium | advisory | wrong-direction | A Copilot file uses Claude `@path` hard-import syntax toward a Claude file. Copilot does not process `@path` hard-imports. |
| `wrong-direction-copilot-links-claude` | copilot | medium | advisory | wrong-direction | A Copilot file soft-references a Claude file (markdown link or frontmatter `see:` / `references:` / `requires:`). Copilot CLI does not follow those links. |
| `missing-intent-artifact` | all | medium | defect | governance | Constructs exist but `.agentic-doctor/intent.json` is missing or invalid. Visible, non-blocking. |
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
| Symlinks | Follows in-repo targets | Skips symlinked targets |
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
✔ No findings.
```

When findings exist (header plus severity-ordered lines):

```
Findings (2):
  [HIGH][advisory] cross-harness-drift: Multiple AI harnesses are configured but share no cross-harness references. This may indicate accidental configuration sprawl rather than intentional multi-harness setup.
  [MEDIUM][defect] missing-intent-artifact: No declared intent artifact found at .agentic-doctor/intent.json. Without declared intent, the doctor cannot evaluate capability preconditions. [assumed intent]
```

Tags are `[SEVERITY][classification]`. Findings with `assumedIntent: true` append `[assumed intent]`. Optional evidence citations print on the following line when present.

### JSON

`--format json` emits a Zod-validated report. Existing aggregate keys stay stable; `inventory` and `edges` are additive.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `archetype` | string | One of the archetype values above |
| `dominanceScore` | number | Top harness share, 0–1 |
| `totalRecords` | number | Length of inventory |
| `harnessBreakdown` | `{ harness, count }[]` | Sorted by harness name |
| `crossHarnessEdges` | number | Count of edges with `crossHarness: true` |
| `inventory` | array | One entry per construct |
| `edges` | array | Flattened composition edges |
| `findings` | array | Criteria results (empty array when none). Present only on full evaluate, not on `--summary`. |
| `snapshotRef` | string? | Present when a local `wisdom/` graph is available |

**Inventory item fields:** `id`, `path`, `harness`, `constructType`, `loadMechanism` (`referenced` \| `convention-loaded`), optional `serverName` / `transport` for `mcp-server` records.

**Edge fields:** `from`, `to`, `type` (`hard-import` \| `soft-reference` \| `glob-binding`), `malformed`, optional `reason` (`missing-target` \| `path-traversal`), `crossHarness` (boolean; always set).

**Finding fields** (full evaluate only):

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | string | Stable id, usually `criterionId:targetId` |
| `criterionId` | string | Matches the criteria table |
| `targetId` | string | What was graded: `all:intent`, `all:<archetype>` (drift), `harness:all`, or a harness pair |
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
      "description": "No declared intent artifact found at .agentic-doctor/intent.json. Without declared intent, the doctor cannot evaluate capability preconditions."
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

With `--summary`, JSON includes archetype fields plus `inventory` only. It does not emit `edges` or `findings`, and it does not run criteria evaluation.

## Declared intent

Optional artifact path: `.agentic-doctor/intent.json`.

**What the shipped evaluator does today:** if constructs exist and this file is missing or invalid, `missing-intent-artifact` fires as a **medium defect** (visible in the report, non-blocking for exit code). When the file is present and valid, that finding clears. The engine can run `intent.capabilityDeclared` checks, but **no shipped criterion uses that check method yet**, so `targetHarnesses` and `desiredCapabilities` do not change findings in the current catalog. Treat the file as version-controlled posture for humans, reviewer agents, and future capability gates.

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

Commit the artifact when multi-harness posture is deliberate. That raises the floor for the next human or agent session: intent is shared law in git, not tribal knowledge in someone's terminal scrollback.

Interactive prompts on a TTY do not write this file, and yes/no answers are not applied to the in-memory intent for that run. Create or update `.agentic-doctor/intent.json` in source control yourself, then re-run doctor.

## Exit codes and CI

### CI contract

- Full evaluate (`doctor` or `doctor --format json`, without `--summary`) sets exit code `1` only when `hasBlockingFindings` is true: at least one finding with `severity` of `critical` or `high` **and** `classification` of `defect`.
- High **advisories** (for example `cross-harness-drift`) never fail the process on their own.
- Medium **defects** (for example `missing-intent-artifact`) appear in the report and do not set exit code `1`.
- `--summary` skips evaluate. Exit code stays `0`. Use it for composition snapshots, not as a merge gate.
- Prefer writing JSON to a file in the same step that gates, so the step exit code is doctor's exit code (avoid bare pipes that drop status unless `pipefail` is on).

| Exit code | When |
| --------- | ---- |
| `0` | No blocking findings, or `--summary` (no evaluate) |
| `1` | At least one critical or high **defect** on a full evaluate |

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
