# Lousy Agents PRD — Harness Engineering Era (v1)

> Internal product definition for the era in which **doctor** (#890) becomes the center of gravity: high-confidence harness configuration across homogeneous and heterogeneous agent setups. Implementation status claims follow the evidence hierarchy in [`harness-capability-matrix.md`](./harness-capability-matrix.md): only behavior locked by release notes and/or passing tests counts as **Shipped**.

## 1. Product Purpose

Enable high-quality, high-confidence **harness engineering** for projects using coding agents in either a **homogeneous** (one harness) or **heterogeneous** (multiple harnesses) setup.

Lousy Agents helps platform and harness engineers see what agentic configuration actually exists, how it composes, and whether it meets the preconditions for the capabilities they intend — instead of discovering silent misconfiguration at runtime.

**Depth today (honest):** Copilot > Claude Code > Codex (thinner). Other harnesses are primarily doctor footprints and thin criteria. Full multi-harness product parity is **not** claimed.

**Sibling product:** [Coach](https://github.com/zpratt/coach) is code-quality feedback (deterministic signals + LLM-as-judge). Lousy Agents is **harness config confidence**. They share a family of concerns (agents, evidence, trust) but different jobs-to-be-done.

## 2. One-Sentence Positioning

A harness-engineering toolkit that inventories, lints, and diagnoses coding-agent configuration — so multi-harness repos get the same confidence single-harness lint never could.

## 3. Target User (this era)

Primary customers are **harness / platform engineers** who own agentic configuration for one or many repositories (spirit of #890 personas):

| Persona | Need in this era |
| --- | --- |
| **Harness Engineer** | Owns a repo’s agentic surface; often runs multiple harnesses; wants diagnosis with rationale, not folklore |
| **Platform / Fleet Governance Engineer** | Runs non-interactively across many repos in CI; needs deterministic JSON and intent-driven checks |
| **Onboarding Developer** | Inherits an unfamiliar repo; uses inventory + edges to learn composition without opening every config file |
| **Skeptical Reviewer** | Requires defects separated from advisories, every finding evidence-backed |

End-users of coding agents benefit indirectly. This era does **not** optimize for anonymous mass adoption UI; it optimizes for engineers who treat harness config as production infrastructure.

## 4. Core Problem

Repositories accumulate agentic configuration across harnesses — Copilot, Claude Code, Codex, and others — each with distinct instruction roots, skills, agents, hooks, MCP servers, and load semantics.

Today:

- There is **no shared inventory** of constructs and composition edges.
- Misconfiguration is often **silent** (wrong-direction imports, missing required files, accidental sprawl).
- Single-harness linters cannot see **cross-harness drift**.
- Scaffold and lint depth is uneven; teams assume parity that does not exist.

Manual, harness-by-harness auditing does not scale to fleet CI or to intentional hybrid setups.

## 5. Product Hypothesis

If a harness engineer can run one local (and CI-friendly) spine that (1) inventories constructs and edges, (2) classifies the repo’s archetype, and (3) evaluates a small evidence-backed criteria set — optionally against declared intent — they will trust and adopt that spine as the control plane for harness config, and will extend scaffold/lint only where the inventory proves gaps.

Voluntary repeat use on real multi-harness repos, plus non-zero CI adoption of doctor JSON, is the proof point — not checklist completeness across every named harness.

## 6. Differentiated Wedge

| Existing tools | Gap | Lousy Agents wedge |
| --- | --- | --- |
| Per-harness docs / tribal knowledge | No machine inventory | **Inventory + typed edges** across harness footprints |
| Single-harness linters | Blind to cross-harness composition | **Archetypes** (pure / hybrid / sprawl / canonical-contract) |
| Generic “AI project” templates | One harness assumed | **Shared catalog** of skills/agents/hooks/instructions with expanding discovery |
| Runtime only (agent fails in session) | Too late | **Precondition criteria** before the agent runs |

This era’s wedge is deliberately narrow: **inventory → edges → archetypes → lint/criteria on a shared catalog**, with doctor as the diagnostic spine even while public docs for doctor remain thin.

## 7. Product Surface (this era)

| Surface | Role |
| --- | --- |
| `@lousy-agents/cli` | Primary entry: `init`, `new`, `lint`, `copilot-setup`, `init-hooks`, **`doctor`** |
| `@lousy-agents/agentic-doctor` | Library + `agentic-doctor` bin — scan, classify, evaluate, JSON report |
| `@lousy-agents/lint` | Programmatic `runLint` for embedders |
| `@lousy-agents/mcp` | MCP tools (incl. Claude Code web setup, workflow helpers) |
| `@lousy-agents/agent-shell` | npm script telemetry + policy / hooks |
| `@lousy-agents/action` | GitHub Action + reviewdog for lint |
| Docs under `docs/` | User-facing command docs; **this tree** for internal product contracts |

**Doctor is the spine of this era** even if undocumented relative to `init`/`lint`: it is the only surface that treats multi-harness composition as a first-class problem (#890, shipped spine v5.16–5.17).

### Era narrative (gravity)

```text
scaffold  →  confidence (lint)  →  runtime (agent-shell)  →  multi-harness paths  →  doctor (#890) as center of THIS era
```

Earlier eras earned the right to diagnose: templates and Copilot depth first, then unified lint and Claude/Codex path discovery, then runtime policy, then doctor as the cross-harness control plane.

## 8. Core Capabilities

Short status only. **Full harness × capability detail:** [`harness-capability-matrix.md`](./harness-capability-matrix.md).

Evidence hierarchy: **Shipped** (release notes + tests) · **Partial** (inventory/lint only or incomplete) · **Specified** (spec/#890 not fully built) · **Planned** / **Parked** / **Gap** / **N/A**.

| Capability | Status (summary) |
| --- | --- |
| Project scaffold (`init` webapp/api/cli) | **Shipped** — Copilot-oriented; GraphQL parked |
| Resource scaffold (`new` agents/skills) | **Shipped** — Copilot paths only |
| Env/setup (`copilot-setup`, Claude web via MCP) | **Shipped** |
| Skill / agent / hook / instruction lint | **Shipped** with multi-path discovery (Copilot + Claude + `.agents` skills); not full roster parity |
| Instruction quality analysis | **Shipped** — Copilot, Claude, `AGENTS.md` |
| Lessons inject/capture | **Shipped** — Claude Code (v5.14) |
| agent-shell telemetry + policy | **Shipped** (v4.0 / v5.6–5.9) |
| MCP tools package | **Shipped** |
| Lint API (`runLint`) | **Shipped**; `lintContent` **Specified** |
| GitHub Action + reviewdog | **Shipped** |
| Doctor inventory + edges + archetypes | **Shipped** spine (v5.16–5.17); criteria set **Partial** vs full #890 |
| MCP server inventory | **Partial** — JSON sources; Codex TOML deferred |
| Declared intent artifact | **Partial** read/evaluate; write-back / wisdom-gated eval not complete |
| Fleet/CI doctor productization | **Partial** — JSON/`--ci` exist; fleet story + public doctor docs thin |
| OpenCode | **Gap** — named in #890, absent from footprints |

## 9. Explicitly Parked

Not abandoned — out of scope for this era’s success bar:

| Item | Why parked |
| --- | --- |
| **GraphQL `init` kind** | README “Not Started”; no customer pull vs doctor spine |
| **Full #890 intent write-back** and durable interactive intent authoring | Spine reads intent; complete write-back loop is a follow-on |
| **Wisdom-gated evaluation** as a hard dependency | Wisdom client degrades gracefully today; gating eval on wisdom is not the v1 trust bar |
| **Standalone doctor npm marketing / docs.modzed** until intentional | Package exists in-workspace (`@lousy-agents/agentic-doctor`); public docs and publish posture wait on intentional productization |
| **Beads as product surface** | Internal task tracking for this repo’s agents — not a Lousy Agents end-user feature |

## 10. Non-Goals

- Not a replacement for harness vendors’ own products (Copilot, Claude Code, Codex, etc.).
- Not a code-quality or PR-review coach — that is **Coach**.
- Not claiming full multi-harness scaffold/lint parity.
- No management dashboards, developer scoring, or surveillance of individual engineers.
- No silent GitHub writes beyond opt-in flows users already run (`copilot-setup` rulesets, Action annotations they enable).
- No universal “one true” instruction format forced on all harnesses; prefer honest footprints and edges.
- No OpenCode support theater without footprints + tests.

## 11. Trust Principles

- **Evidence over aspiration** — matrix and PRD status follow the hierarchy; Partial beats false Shipped.
- **Defects ≠ advisories** — doctor classifications and lint severities must stay distinguishable.
- **Cite the tree** — findings should point at paths, edges, and criteria ids, not vibes.
- **Degrade honestly** — missing wisdom, missing intent, or empty inventory are explicit states, not fake greens.
- **Depth before breadth** — improve Copilot/Claude/Codex honesty before adding decorative harness names.
- **Sibling clarity** — never blur Coach (code quality) with Lousy Agents (harness config).

## 12. Success Signals (this era)

- Harness engineers run `doctor` (human or JSON) on real multi-harness repos more than once without being prompted by the maintainer.
- At least one fleet/CI consumer ingests `doctor --format json` inventory/edges (or documents a concrete plan blocked only on a listed Partial gap).
- Zero **Shipped** claims in the matrix that lack release-note or test anchors.
- Cross-harness wrong-direction / sprawl findings are understood as valuable, not noise, in pilot feedback.
- Scaffold/lint work is prioritized from inventory gaps (matrix-driven), not from untracked checklist expansion.
- Coach and Lousy Agents remain separately explainable in one sentence each to a new platform engineer.

## 13. Roadmap

### Now

- Treat **doctor** as the era spine: inventory, edges, archetypes, seed criteria, JSON/`--ci`.
- Keep Copilot depth excellent; preserve Claude lessons/hooks/skill paths; keep Codex thinner but truthful.
- Maintain the **capability matrix** as the parity contract; refuse false multi-harness claims.
- Close high-value Partial gaps that unblock CI consumers (JSON contract stability, criteria clarity).

### Next

- Broaden criteria toward #890 capability preconditions where evidence exists.
- MCP inventory completeness (e.g. Codex TOML decision).
- Intent artifact write-back that is reviewable and CI-safe.
- `lintContent` (specified string API) if embedder demand holds.
- Intentional doctor docs/publish posture when the spine earns it.

### Later

- True multi-harness scaffold/resource parity where demand is proven.
- OpenCode only with footprints + tests.
- Deeper fleet governance aggregation.
- Architecture doc describing doctor + lint + scaffold as one system (see §14).
- Revisit parked GraphQL init only with clear user pull.

## 14. Relationship to the Matrix and Future Architecture Doc

| Doc | Role |
| --- | --- |
| **This PRD** | Era purpose, users, wedge, non-goals, success, roadmap |
| **[`harness-capability-matrix.md`](./harness-capability-matrix.md)** | Living parity contract — capability × harness status + evidence tags |
| **Future architecture doc** (not written in this change) | System design: package boundaries, doctor data model, CI/fleet topology, how scaffold/lint/doctor share catalogs |

Product claims in README, release marketing, or issues must not outrun the matrix. When implementation lands, update the matrix first, then tighten PRD status tables.

---

*Sibling reminder: Coach = code quality feedback. Lousy Agents = harness configuration confidence.*
