# Harness Capability Matrix

Living parity contract for Lousy Agents harness engineering. This document is the authoritative cross-harness status map. Product narrative and era framing live in [`prd.md`](./prd.md).

**Last seeded from:** `packages/doctor/src/entities/harness-footprints.ts`, `packages/doctor/src/use-cases/criteria.ts`, `docs/lint.md`, root `README.md` roadmap, `packages/doctor` (`@lousy-agents/agentic-doctor`), and release notes through v5.17.x.

Status claims follow the evidence hierarchy. Do **not** read a green cell as "full multi-harness product support." Depth today is **Copilot > Claude Code > Codex (thinner)**; remaining harnesses are mostly inventory footprints and criteria stubs.

---

## 1. How to read

Rows are product capabilities. Columns are harness families (plus `shared` for multi-reader constructs). Each cell is a status from the legend below. Prefer the narrowest honest status.

When a capability is harness-agnostic (e.g. published package surface), use the **Shared / product** notes column and mark per-harness cells N/A where the harness is not the unit of delivery.

### Status legend

| Status | Meaning |
| --- | --- |
| **Shipped** | Locked by release notes and/or passing tests; externally usable |
| **Partial** | Inventory/lint only, incomplete surface, or thinner depth than Copilot baseline |
| **Specified** | Spec / #890 acceptance criteria exist; not fully built |
| **Planned** | Intended; no complete spec lock yet |
| **Parked** | Explicitly deferred (see PRD §9) |
| **N/A** | Not applicable to this harness or delivery unit |
| **Gap** | Named product need with no footprint/implementation (e.g. OpenCode) |

### Evidence hierarchy (authoritative)

1. **Shipped** — release notes + tests
2. **Partial** — inventory/lint only or incomplete
3. **Specified** — spec / #890 not fully built
4. **Planned** / **Parked** / **Gap** / **N/A** as appropriate

---

## 2. Harness roster

| Harness | Footprint status | Primary indicators (doctor) | Notes |
| --- | --- | --- | --- |
| **copilot** | verified | `.github/copilot-instructions.md`, `.github/instructions/` | Deepest product surface: init, new, copilot-setup, lint, action, agent-shell hooks |
| **claude** | verified | `CLAUDE.md`, `.claude/` | Strong second: skill lint, hook lint, lessons, doctor edges (`@` hard-import), Claude Code web setup via MCP |
| **codex** | verified | `AGENTS.override.md`, `.codex/`, `.agents/skills/`, `.codex-plugin/` | Thinner: reads `AGENTS.md`; skill lint under `.agents/skills/`; MCP TOML deferred |
| **antigravity** | needs-verification | `GEMINI.md`, `.gemini/` | Footprint only; criteria thin |
| **hermes** | verified | `.hermes.md`, `HERMES.md`, `SOUL.md` | Footprint + missing-config advisory criterion |
| **crush** | verified | `crush.json`, `.crush/` | Footprint + missing-config advisory; also lists `.agents/skills/` |
| **pi** | verified | `.pi/`, `.pi/skills/`, `.pi/prompts/` | Footprint; skills/prompts construct typing in scanner |
| **shared** | verified | `AGENTS.md` / `AGENTS.MD` / `agents.md` | Canonical multi-reader contract; `.mcp.json` attributed shared |
| **OpenCode** | **Gap** | — | Named in #890 problem statement; **not** in `HARNESS_NAMES` / footprints |

`HARNESS_NAMES` (code): `claude`, `copilot`, `codex`, `antigravity`, `hermes`, `crush`, `pi`. `shared` is a synthetic multi-match / convention harness, not listed in `HARNESS_NAMES`.

---

## 3. Capability × harness matrix

Legend abbreviations: **S** Shipped · **P** Partial · **Sp** Specified · **Pl** Planned · **Pk** Parked · **G** Gap · **—** N/A

| Capability | copilot | claude | codex | antigravity | hermes | crush | pi | shared | OpenCode | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Project scaffold** (`init` kinds) | S | — | — | — | — | — | — | — | G | webapp / api / cli shipped (README roadmap). Templates are Copilot-oriented. GraphQL init **Parked**. |
| **Resource scaffold** (`new` agents/skills) | S | — | — | — | — | — | — | — | G | `new --copilot-agent`, `new skill` → `.github/agents/`, `.github/skills/` only. |
| **Env/setup workflow** | S | S | — | — | — | — | — | — | G | `copilot-setup` CLI + rulesets. Claude Code web setup via MCP `create_claude_code_web_setup` (README ✅). |
| **Instruction roots** | S | S | P | P | P | P | P | S | G | Lint instruction discovery: Copilot paths, `CLAUDE.md`, `AGENTS.md`. Doctor footprints cover all roster harnesses for inventory. |
| **Skill discovery/lint** | S | S | S | — | — | P | P | — | G | Lint: `.github/skills/` (baseline), `.claude/skills/` **v5.5**, `.agents/skills/` **v5.13**. Doctor types `.agents/skills/`, `.pi/skills/`, `.pi/prompts/` as skills when inventoried. |
| **Agent/subagent discovery** | S | P | — | — | — | — | — | — | G | Lint agents: `.github/agents/` only. Doctor: `.claude/agents/` → `subagent`, `.claude/commands/` → `agent` (inventory, not frontmatter lint parity). |
| **Hook lint** | S | S | — | — | — | — | — | — | G | Copilot `.github/hooks/agent-shell/hooks.json`; Claude `.claude/settings.json` (+ local). Unified lint **v5.7** era; baseline unified diagnostics **v2.9**. |
| **Instruction quality lint** | S | S | P | — | — | — | — | P | G | Formats in `docs/lint.md`: Copilot instructions/agents, `CLAUDE.md`, `AGENTS.md`. Quality dimensions: structural context, execution clarity, loop completeness. |
| **Doctor inventory + edges** | S | S | S | P | S | S | S | S | G | `@lousy-agents/agentic-doctor` + CLI `doctor` **v5.16**; JSON inventory + typed edges **v5.17**. Edges: hard-import / soft-reference / glob-binding per footprint. antigravity `needs-verification`. |
| **Doctor archetypes + criteria** | S | S | P | P | P | P | P | S | G | Archetypes: pure, intentional-hybrid, canonical-contract, accidental-sprawl, none, ambiguous. Seed criteria skew Copilot/Claude/Codex missing-required + cross-harness drift advisories. |
| **MCP server inventory** | S | S | Sp | — | — | — | — | S | G | JSON `mcpServers` from `.mcp.json` (shared) and `.vscode/mcp.json` (copilot). Codex `[mcp_servers.*]` TOML **deferred** (spec open question). |
| **Declared intent** (`.agentic-doctor/intent.json`) | P | P | P | P | P | P | P | P | G | Read + evaluate against criteria **Partial**. Full #890 intent write-back, wisdom-gated eval, durable elicitation **Specified / Parked** (see PRD). |
| **Lessons inject/capture** | — | S | — | — | — | — | — | — | G | Claude Code hooks + `.lousy-agents/lessons/` **v5.14** (`init-hooks`, `lint lessons`). |
| **agent-shell telemetry/policy** | S | S | — | — | — | — | — | — | G | Package **v4.0** (telemetry/policy); preToolUse policy **v5.6**; flight recorder / init **v5.9**. Hook lint paths cover Copilot + Claude wiring. |
| **MCP tools package** | S | S | — | — | — | — | — | S | G | `@lousy-agents/mcp` published; tools are client-agnostic; deepest integration docs target VS Code / Copilot / Claude Code web. |
| **Lint API / `lintContent`** | S* | S* | S* | — | — | — | — | — | G | `runLint` **Shipped** (`@lousy-agents/lint`). `lintContent` string API **Specified** (`.github/specs/lint-string-input.spec.md`); not a full shipped export path yet. \*per discovered paths above. |
| **GitHub Action + reviewdog** | S | S | S | — | — | — | — | — | G | `action.yml` / `@lousy-agents/action` — skills/agents/hooks/instructions via reviewdog reporters. Skill inputs document `.github` + `.claude` paths. |
| **Fleet/CI doctor JSON** | P | P | P | P | P | P | P | P | G | `doctor --format json` + `--ci` + `--summary` exist (v5.16–5.17). Fleet aggregation productization and intentional public doctor docs **not** shipped. |

---

## 4. Brief evidence notes

| Area | Tags / anchors | Honesty check |
| --- | --- | --- |
| Doctor spine | **v5.16.0** agentic-doctor CLI (#890); **v5.17.0** inventory + edges JSON; package `@lousy-agents/agentic-doctor` `0.1.0` in-tree | Usable via CLI workspace; **no** standalone doctor README / intentional npm docs story yet |
| Lessons | **v5.14.0** inject/capture + `init-hooks` | Claude-only |
| Skill lint paths | **v5.5.0** `.claude/skills/`; **v5.13.0** `.agents/skills/` | Discovery ≠ scaffold parity |
| Unified lint | **v2.9.0** agents + instruction quality + formats; later hooks **v5.7.0** | Copilot/Claude heavy |
| agent-shell | **v4.0.0** monorepo + telemetry; **v5.6.0** preToolUse policy; **v5.9.0** flight recorder / init | Not a multi-harness abstraction layer |
| Footprints | `harness-footprints.ts` | OpenCode absent; antigravity unverified |
| Criteria | `criteria.ts` | Small curated set; not full #890 capability-precondition matrix |
| MCP inventory | `mcp-config.ts` | JSON only; Codex TOML gap called in doctor-json spec |
| Intent artifact | `declared-intent.ts`, `intent-artifact.ts` | Read path live; write-back / wisdom-gated eval incomplete vs #890 |
| Init kinds | README roadmap | webapp/api/cli ✅; GraphQL Not Started → **Parked** in PRD |

---

## 5. Seed sources (keep in sync)

When changing parity claims, re-read:

| Source | Why |
| --- | --- |
| `packages/doctor/src/entities/harness-footprints.ts` | Roster, indicators, edge mechanisms, walk boundaries |
| `packages/doctor/src/use-cases/criteria.ts` | What doctor actually grades today |
| `packages/doctor/src/gateways/scanner.ts` / `mcp-config.ts` | Construct typing, MCP sources |
| `docs/lint.md` | Discovery tables for skills, agents, hooks, instructions |
| Root `README.md` roadmap | Scaffold/lint/lessons/MCP/agent-shell completion claims |
| `.github/specs/doctor-json-inventory-and-edges.spec.md` | JSON inventory contract + deferred Codex TOML |
| `#890` Agentic Configuration Doctor | Intent, personas, full acceptance surface |
| Release notes `v2.9`, `v4.0`, `v5.5–5.9`, `v5.13–5.17` | Shipped evidence tags |

---

## 6. Maintenance rules

1. Prefer **Partial** over **Shipped** when only inventory or single-path lint exists.
2. Adding a footprint is not product parity — update scaffold/lint/docs cells separately.
3. OpenCode stays **Gap** until it appears in footprints **and** has at least inventory tests.
4. Coach (sibling) is out of scope here — code quality feedback, not harness config confidence.
5. PRD era claims must not outrun this matrix; link here for full detail.
