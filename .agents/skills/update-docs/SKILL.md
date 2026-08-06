---
name: update-docs
description: "Audits customer-facing documentation against implemented specs, produces a gap report, and drafts file edits that bring docs back into alignment with shipped behavior"
argument-hint: "Optional spec or feature name to scope the audit; omit for a full audit"
effort: high
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Role
You are a technical documentation engineer specializing in developer-facing documentation for AI agent tooling. Your audience is the engineers consuming the `lousy-agents` published packages (`@lousy-agents/cli`, `@lousy-agents/mcp`, `@lousy-agents/agent-shell`), who need accurate, current, copy-pasteable documentation to integrate and operate the system.

# Goal
Audit the customer-facing documentation in this repository against the implemented specs, then produce (a) a gap report and (b) drafted file edits that bring docs back into alignment with shipped behavior.

# Sources of truth
- **Specs (authoritative for shipped behavior):** Queryable via the `graphify` skill. The graph artifact lives in `graphify-out/`. The on-disk source for spec content is `.github/specs/` — this is the filesystem analog of what `graphify` exposes as `Spec` nodes, and is the fallback when a graph query is ambiguous. If a spec exists, treat the feature as released and in-scope for documentation.
- **Existing documentation (also ingested in `graphify`):** Use the graph as the primary lens for "what's documented" — it's faster and more reliable than text-walking docs, and exposes spec ↔ doc and doc ↔ doc relationships. The materialized docs on disk are:
  - `README.md` at the repo root (entry point, advertises packages and links to deeper docs)
  - `docs/*.md` (per-CLI-subcommand and MCP server reference: `init.md`, `new.md`, `lint.md`, `copilot-setup.md`, `mcp-server.md`)
  - `packages/<published-pkg>/README.md` for any published package documented at the package level (e.g. `packages/agent-shell/README.md`)
- **Filesystem:** The materialization layer. Use it to (a) resolve doc node IDs to real file paths, (b) cross-check that ingested doc and spec nodes still match what's on disk, and (c) land Phase 4 patches.
- **Package source code under `packages/`:** Tiebreaker only — when spec and docs conflict, or to confirm exact public API shape (exported names, signatures, defaults, CLI flags). Never document anything not surfaced in a spec.

**Out of scope** (agent-operating files and CI infrastructure, not customer docs):
- `CLAUDE.md`, `GEMINI.md` at the repo root
- `.claude/`
- Under `.github/`: `workflows/`, `ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE*`, `instructions/`, `copilot/`, `chatmodes/`, `prompts/`, and similar agent/CI config files
- Internal workspace packages (`packages/core`, `packages/github-action`) — only the three published packages are customer-facing

**Explicitly IN scope** (do not skip):
- `.github/specs/` — canonical spec directory, source for spec discovery alongside `graphify`

# Workflow — execute in order, do not skip phases

## Phase 1 — Inventory
1. **Discover the graph schema.** Use `graphify` to list available node types and edge types so you know how specs and docs are modeled (e.g., `Spec`, `DocPage`, `documents` edge). Surface this schema in your output so I can verify your queries are aimed correctly. Confirm the graph's spec nodes correspond to files under `.github/specs/`; if they don't, surface that mismatch.
2. **Enumerate specs.** Query `graphify` for all implemented specs → flat list of `{spec_id, feature_name, package, status, released_at, source_path}`. Scope to the three published packages. Cross-check that every `Spec` node has a corresponding file under `.github/specs/` and vice versa.
3. **Enumerate docs.** Query `graphify` for all doc nodes → flat list of `{doc_id, title, package, file_path, related_spec_ids}`. Expect to find at minimum the root `README.md`, the files under `docs/`, and any published-package READMEs.
4. **Cross-check graph ↔ filesystem.** For every doc node, confirm the resolved file path exists on disk. For every doc file under the customer-facing surface (root `README.md`, `docs/`, `packages/<published>/README.md`), confirm it has a corresponding graph node. Repeat for specs under `.github/specs/`. Flag drift — it indicates stale ingestion and means analysis can't fully trust the graph until reconciled.
5. Output all three inventories (specs, docs, drift) and stop. If anything looks suspiciously incomplete (zero specs, zero edges between specs and docs, an expected package missing, `.github/specs/` empty or not scanned), surface that before continuing.

## Phase 2 — Coverage matrix
Derive the matrix from graph relationships first, filesystem second. For each implemented spec, classify as exactly one of:
- ✅ **Documented & current** — spec has an edge to one or more doc nodes, and content matches the spec
- ⚠️ **Documented but stale** — spec has an edge to a doc node, but content has drifted (cite the drift)
- ❌ **Undocumented** — spec has no edge to any doc node (or the edge exists but the resolved file is missing/empty)
- 🟡 **Partially documented** — some surface covered, some missing

Cite spec IDs, doc IDs, and file paths for every row. No row may be unclassified.

If the graph does not model spec↔doc relationships explicitly, say so, fall back to name/keyword matching across spec and doc nodes, and flag this as a graph-modeling gap in the follow-up notes.

As a sanity check, the recently released **agent lessons** feature (its implementation is visible under `.lousy-agents/lessons/`, and its spec should exist under `.github/specs/`) should appear as ❌ — it's not mentioned in the root `README.md`'s Features, Documentation, or Roadmap sections, and there's no `docs/lessons.md`. If it doesn't surface as ❌, your Phase 1 inventory or matrix logic is wrong — stop and recheck.

## Phase 3 — Gap report
For every ⚠️, ❌, and 🟡 row, write a short entry containing:
- What the feature does, in your own words (1–2 sentences — not a copy of the spec)
- What's missing or wrong in the current docs
- What new or revised pages/sections are needed, and where they should live (file path + section anchor)
- Whether the root `README.md` needs a matching update (e.g., new entry under Features, Documentation, or Roadmap)
- Any related specs or docs the graph surfaces that should be cross-linked

Group entries by package. Within each package, order by user impact (highest first).

## Phase 4 — Drafted patches
For every ❌ and ⚠️ row, produce a concrete documentation patch as file edits (not prose suggestions):
- **Respect the existing layout convention.** CLI subcommands and MCP get a top-level `docs/<topic>.md`. Standalone packages document themselves in `packages/<pkg>/README.md`. Don't invent a new pattern — pick the one that matches what's already used for sibling features.
- Use the graph to find 2–3 sibling doc nodes for the same package; read those files and match their voice, structure, and heading conventions.
- Lead with the user-facing purpose of the feature, then the minimum viable usage example, then the full reference (flags, options, config).
- Include runnable code examples where applicable (npx invocations, config snippets).
- Update the root `README.md` in the same patch: add the new doc to the Documentation list, add a Features entry if appropriate, and update the Roadmap row if the feature appears there.
- Add cross-links to related docs the graph surfaces.

# Constraints (non-negotiable)
- **Specs are the source of truth for what ships.** Don't document features that aren't in a spec, even if you find them in code or in stale doc nodes.
- **Don't invent behavior.** If a spec is ambiguous on some detail, flag it in the gap report — don't guess and write it up as fact.
- **Trust the graph, verify against the filesystem.** Any disagreement between the two is itself a finding and goes in the drift list.
- **Don't restructure existing docs** beyond what's required to add or correct content. Surface restructuring proposals in the follow-up notes.
- **Public surface only.** No internal or private APIs. Internal packages (`packages/core`, `packages/github-action`) are out of scope.
- **Preserve the root README as the entry point.** Any new doc page must be discoverable from `README.md`.

# Definition of done
- Phase 1 outputs the graph schema, three inventories (specs, docs, drift), and pauses for review
- Phase 2 matrix classifies every implemented spec, with citations to spec IDs, doc IDs, and file paths
- Phase 3 gap report covers every ⚠️, ❌, and 🟡 row with a concrete remediation plan
- Phase 4 produces drafted file edits for every ❌ and ⚠️ row, including root `README.md` updates, ready for review
- Top-of-output summary reports: total specs, % documented, new pages added, pages updated, drift items found

# Output format
1. Executive summary (≤6 lines)
2. Phase 1: graph schema + three inventories (specs, docs, drift)
3. Phase 2 coverage matrix (one table, grouped by package)
4. Phase 3 gap report (grouped by package, ordered by impact)
5. Phase 4 drafted patches (as file edits)
6. Follow-up notes (graph-modeling gaps, restructuring proposals, ambiguous specs, anything out of scope)

Begin with Phase 1. Do not skip ahead.
