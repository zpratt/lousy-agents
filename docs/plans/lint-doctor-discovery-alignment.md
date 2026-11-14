# Lint and doctor discovery alignment

Discovery and planning only. This branch does not change production discovery. The acceptance tests are the definition of done for the corrective work: a fix is complete when each `it.fails` below is changed back to `it` and the assertion passes.

## Does lint have the same bug?

Yes. `lint` does not see the nested instruction files that [PR #1576](https://github.com/zpratt/lousy-agents/pull/1576) taught `doctor` to inventory, and it does lint fixture copies that sit inside trees it already walks.

| Question | Answer | Evidence |
| --- | --- | --- |
| Does lint miss nested `CLAUDE.md` / `AGENTS.md`? | Yes | `it.fails` "should discover a nested CLAUDE.md and a nested AGENTS.md when lint analyzes the repository". Doctor inventories `packages/foo/CLAUDE.md` (claude) and `packages/bar/AGENTS.md` (shared). Lint's report does not name either file. The same miss shows up when the scan root is a directory named `tests` (`src/CLAUDE.md` is kept by doctor and skipped by lint) and when the scan root is `tests/fixtures` (the root `CLAUDE.md` is seen by both; `case/CLAUDE.md` is seen only by doctor). |
| Does lint lint test fixtures? | Yes, for files inside trees it already walks. Nested `CLAUDE.md` under `tests/fixtures` is not a false positive today, because lint never looks there. | `it.fails` "should leave fixture copies inside instruction, agent, and skill roots out of lint". Lint reports `.github/instructions/tests/fixtures/trap.instructions.md`, `.github/agents/testdata/trap.md`, and `.github/skills/__fixtures__/SKILL.md`. Doctor inventories none of them. A passing test locks the layouts both tools already ignore: `tests/fixtures`, `packages/bar/tests/fixtures`, `pkg/__fixtures__`, `testdata`, `node_modules`, and `dist` when the file is a `CLAUDE.md` outside a catalog walk. That passing test becomes a real guard once nested discovery is added. |
| Does lint handle `.github/instructions/`? | Only `*.instructions.md`. `CLAUDE.md` and `AGENTS.md` there are invisible. | `it.fails` "should treat CLAUDE.md and AGENTS.md inside .github/instructions as Claude and shared instructions". Doctor attributes `.github/instructions/CLAUDE.md` to claude, `.github/instructions/AGENTS.md` to shared, and `.github/agents/CLAUDE.md` to copilot. Lint does not list the first two. A passing test locks the copilot attribution of `.github/agents/CLAUDE.md` and the exclusion of `.github/instructions/README.md`. |
| Does lint handle all-caps `AGENTS.MD`? | No. `agents.md` is missed too. | `it.fails` "should discover root and nested AGENTS.MD and agents.md as agents-md instructions". Doctor inventories root `AGENTS.MD`, `packages/foo/AGENTS.MD`, and `agents.md` as shared. Lint's discovery list has none of them as `agents-md`. |

The parity test is `it.fails` "should discover the same agentic paths with lint and with doctor". On one repository, with every lint target flag turned on, the two path sets differ by exactly the rows above plus the depth and `dist` gaps below. `.claude/commands/deploy.md` is excluded from that comparison on purpose (doctor inventories it, lint has no command rules).

## Where the tests live

File: `packages/cli/src/commands/lint-doctor-discovery.acceptance.integration.test.ts`

The harness follows `lint-claude-import.integration.test.ts`: `tsx` runs `packages/cli/src/index.ts` against a temporary repository. Lint is observed from its human report (`Discovered …` lines, `path (format)`, diagnostics, and `path: OK`). Doctor is observed from `doctor --format json --ci` inventory and findings. `CONSOLA_LEVEL=3` is set because a `VITEST` environment hides info and success lines, which would make a clean file look undiscovered.

The file is an integration test (`*.integration.test.ts`), so `mise run test-integration` runs it after the workspace build. Eleven tests use Vitest `it.fails`. The assertion is the desired behavior and fails today; Vitest records that as an expected failure, so `mise run ci` stays green. When a fix makes the assertion pass, `it.fails` fails the suite until it is changed to `it`. That change is the definition of done. Do not weaken the assertion to make `it.fails` go away.

### Acceptance tests that fail today

| Test | What it proves | Observed result |
| --- | --- | --- |
| should discover a nested CLAUDE.md and a nested AGENTS.md when lint analyzes the repository | Nested instruction miss | Lint false, doctor true |
| should discover root and nested AGENTS.MD and agents.md as agents-md instructions | Case spellings doctor already reads | Lint false, doctor harness `shared` |
| should treat CLAUDE.md and AGENTS.md inside .github/instructions as Claude and shared instructions | Suffix directory must not swallow these names | Lint false; doctor claude / shared; `.github/agents/CLAUDE.md` stays copilot |
| should leave fixture copies inside instruction, agent, and skill roots out of lint | False positives on walks lint already does | Lint reports all three; doctor reports none |
| should keep CLAUDE.md under src/fixtures, test/fixtures, spec/fixtures, and tests/unit/fixtures | Accepted gap stays visible to both | Doctor true, lint false |
| should discover an instruction file nine directories below .github/instructions in both tools | Depth is measured from different roots | Lint true, doctor false |
| should leave a generated instruction file inside a dist directory out of both tools | `dist` skip is doctor's only | Lint true, doctor false |
| should discover the same agentic paths with lint and with doctor | Parity of the fixture | See the path diff below |
| should discover src/CLAUDE.md and skip fixtures when lint starts in tests | Scan root named `tests` | Lint sees neither; doctor sees only `src/CLAUDE.md` |
| should discover the root and nested CLAUDE.md when lint is pointed at tests/fixtures | Pointing at a fixture still scans that tree | Lint sees the root file only; doctor sees both |
| should surface the unreadable MCP config from lint and from doctor | Doctor drops malformed `.mcp.json` | Lint names the file; doctor inventory and findings do not |

Parity path diff (lint on the right, doctor on the left), with `.claude/commands/deploy.md` removed from both sides:

Lint has, and doctor does not:

- `.github/agents/testdata/trap.md`
- `.github/instructions/1/2/3/4/5/6/7/8/9/deep.instructions.md`
- `.github/instructions/dist/generated.instructions.md`
- `.github/instructions/tests/fixtures/trap.instructions.md`
- `.github/skills/__fixtures__/SKILL.md`

Doctor has, and lint does not:

- `.github/instructions/AGENTS.md`
- `.github/instructions/CLAUDE.md`
- `AGENTS.MD`
- `agents.md`
- `packages/bar/AGENTS.md`
- `packages/foo/AGENTS.MD`
- `packages/foo/CLAUDE.md`
- `spec/fixtures/CLAUDE.md`
- `src/fixtures/CLAUDE.md`
- `test/fixtures/CLAUDE.md`
- `tests/unit/fixtures/CLAUDE.md`

### Acceptance tests that pass today

These lock behavior the corrective work must not regress.

| Test | What it locks |
| --- | --- |
| should discover the root instruction files, skills, agents, hooks, and MCP configs in both tools | Root `CLAUDE.md`, `AGENTS.md`, `AGENTS.override.md`, `.claude/CLAUDE.md`, Copilot instructions, one-level `SKILL.md` roots including `.pi/prompts`, `.github/agents/reviewer.md`, a `preToolUse` hook, `.claude/settings.json` with a `hooks` object, and both MCP configs |
| should leave tests/fixtures, __fixtures__, testdata, node_modules, dist, and a non-instruction README out of both tools | `CLAUDE.md` outside a catalog walk, plus `.github/instructions/README.md` and a `*.instructions.md` under `node_modules` |
| should leave subagents and MCP configs out of a default lint run | Flag-only rollout. A full flag set does see them |
| should inventory a Claude command and leave it out of lint | `.claude/commands/` stays doctor-only until command rules exist |
| should discover src/CLAUDE.md and skip fixtures when doctor starts in tests | Doctor's parent-segment fixture rule |
| should inventory the fixture tree when doctor is pointed at it | The scan root itself is never skipped |
| should omit the locked skill from lint and still inventory it in doctor | `skills-lock.json` stays a lint-only filter |
| should leave the hook file out of lint and inventory it in doctor | Copilot `preToolUse` heuristic stays a lint-only filter |

## How discovery works today

Both tools already share pieces of core: `AGENTIC_LOCATION_CATALOG`, `MCP_CONFIG_SOURCES`, `walkRepository`, import tokenization, and the import-target classifier. They do not share the decision of which files count.

Doctor (`packages/doctor/src/gateways/scanner.ts`) walks the whole tree once from the repository root. It collects `.md`, `.mdc`, `.json`, `.yaml`, `.yml`, `.toml`, and `.cursorrules`. The extension check is case-insensitive, which is why `AGENTS.MD` is collected. It skips `node_modules`, `.git`, and `dist`, and it does not enter `tests/fixtures` (including when the scan root is named `tests`), `__fixtures__`, or `testdata`. The start directory is listed before that predicate, so a run whose root is the fixture still scans it. `revisit` is `refuse-ancestors`, so a second in-repo alias is a second inventory record. Depth 10 is counted from the repository root. Files with no harness are dropped. A nested `CLAUDE.md` / `AGENTS.md` / `AGENTS.MD` / `agents.md` is claimed by basename when no harness directory already owns the path. `.github/instructions/` does not own those names, because Copilot only loads `*.instructions.md` there (`isExcludedBySuffix` plus `SUFFIX_RESTRICTED_DIRECTORY_INDICATORS`). `.github/agents/CLAUDE.md` stays a Copilot agent. MCP servers are a second pass over `MCP_CONFIG_SOURCES`; invalid JSON becomes an empty list.

Lint instructions (`FileSystemInstructionFileDiscoveryGateway`) do not walk the repository. They look up catalog entries that have an `instructionFormat`: exact paths `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.github/copilot-instructions.md`, plus `.github/instructions/**/*.instructions.md` and the top level of `.github/agents/*.md`. The filename compare is case-sensitive, so `AGENTS.MD` and `agents.md` miss. There is no fixture predicate and no `dist` skip. `revisit` is `once-per-real-directory`. Depth 10 is counted from `.github/instructions`, not from the repository root.

The other lint targets do not use that walk:

| Target | Finder | What it accepts | What it skips |
| --- | --- | --- | --- |
| Skills | `skill-lint-gateway.ts` | `SKILL.md` one directory below `.github/skills`, `.claude/skills`, `.agents/skills`, `.pi/skills`, `.pi/prompts` | Every symlink. Then `skills-lock.json` drops locked names. No fixture or `dist` skip |
| Agents | `markdown-file-discovery.ts` | `.md` at any depth under `.github/agents`, depth cap 32 | Every symlink. Case-sensitive `.md`. No fixture skip |
| Subagents | same walker | `.md` under `.claude/agents` | Same. Flag-only (`--subagents`) |
| Hooks | exact paths from the catalog | Copilot file only when the text contains `"preToolUse"`. Claude settings only when the JSON has a `hooks` object | Symlinks, files over the size cap. Default-on for the three exact paths |
| MCP | `MCP_CONFIG_SOURCES` | `.mcp.json`, `.vscode/mcp.json`, including malformed JSON | Symlinks and paths that leave the root. Flag-only (`--mcp-servers`) |
| Lessons | `lint lessons` | `.lousy-agents/lessons/*.md` | Not in the catalog. Doctor does not inventory them |
| Commands, plugins, `GEMINI.md`, Hermes, Crush | not linted | Doctor inventories them from footprints | Explicitly deferred in `docs/lint.md` |

## Divergence map

| Topic | Lint | Doctor | Aligned? |
| --- | --- | --- | --- |
| Nested `CLAUDE.md`, `AGENTS.md` | Root, plus `.claude/CLAUDE.md` | Any depth, unless a harness directory already owns the path | No. This is the bug |
| `AGENTS.MD`, `agents.md` | Miss | Shared instructions, and the file is read | No |
| `CLAUDE.MD`, `SKILL.MD`, other capitalized extensions | Miss | The walk accepts the extension; harness matching is still case-sensitive, so a root `CLAUDE.MD` is not a nested instruction. Owner is not worried. Do not case-fold the shared filename set | Leave it. Do not make it worse |
| `.github/instructions/CLAUDE.md` and `AGENTS.md` | Miss (suffix filter) | Claude and shared | No |
| `.github/instructions/README.md` | Miss | Miss | Yes |
| `.github/instructions/**/*.instructions.md` | Yes, depth 10 from that directory | Yes, until the root-relative depth cap | Same for shallow trees |
| `.github/agents/*.md` | Agent lint, and instruction lint at the top level only (`includeSubdirectories` is false) | One agent record, including `CLAUDE.md` as copilot | Paths agree at the top level. Nested agent markdown is an agent for both only if lint's agent walk sees it; it is not an instruction for lint |
| `.github/agents/CLAUDE.md` | Copilot agent and `copilot-agent` instruction | Copilot agent | Yes for the path. Lint also scores it as an instruction |
| Fixture dirs | Not applied. False positives inside catalog trees | `tests/fixtures`, `__fixtures__`, `testdata` | No |
| `test/fixtures`, `spec/fixtures`, `tests/unit/fixtures`, `src/fixtures` | Invisible until nested discovery exists | Inventoried. Accepted gap from #1576 | Keep them visible. The failing acceptance test locks that |
| `node_modules`, `.git` | Skipped by the shared walk | Skipped | Yes |
| `dist` | Not skipped. `.github/instructions/dist/*.instructions.md` is linted | Skipped | No |
| Depth | 10 from each catalog root | 10 from the repository root. Nine levels under `.github/instructions` are past doctor's cap | No |
| Directory aliases | One real directory, one file | Each logical path is a record. Real content is read once | Intentional for doctor's graph. Compare by real path when asserting parity of bytes, by logical path when asserting what a harness can load |
| Symlinks | Instructions follow in-repo links. Skills, agents, subagents, and hooks skip every symlink | In-repo links are followed for every inventoried file | Intentional exception. Do not change it in the instruction fix |
| `skills-lock.json` | Drops locked skills after discovery | Still inventories them | Intentional. Passing acceptance test |
| Hook heuristic | Copilot file without `preToolUse` is invisible. Claude file without a `hooks` object is invisible | The path is inventoried whenever the catalog matches | Intentional filter after discovery. Passing acceptance test |
| MCP paths | Same two files. Malformed JSON is `mcpserver/invalid-json` | Same two files. Malformed JSON is dropped, with no finding | Paths agree. Errors do not |
| Subagents and MCP by default | Off unless flagged | Always inventoried | Intentional rollout. Passing acceptance test |
| `.claude/commands`, `.codex-plugin`, `GEMINI.md`, Hermes, Crush | Not linted | Inventoried | Intentional until rules exist. Command path is locked by a passing test |
| Lessons | `lint lessons` only | Not inventoried | Out of scope |
| Prompts | `.pi/prompts/*/SKILL.md` is a skill | Same path is a skill. Other files under `.pi/` are also inventoried | Skill file agrees. Extra files are the broad-directory issue below |
| Import scope | Transitive `@` expansion and `instruction/import-cycle` | One level, claude-harness files only | Separate problem, [#1517](https://github.com/zpratt/lousy-agents/issues/1517). Not this plan |
| Unreadable or hard-linked files | `instruction/parse-error` for instructions. Hard-link refusal only for Claude entrypoints. Skills and agents are not checked | `instruction-file-unread` for every harness markdown file, including skills and agents | Presentation and strictness differ. Do not unify the rule ids here |
| Limit and symlink warnings | `instruction/discovery-limit-reached`, `instruction/discovery-symlink-skipped` | `discovery-limit-reached`, `discovery-symlink-skipped` | Same limits helper, different ids. Leave the ids |
| Ignore config | None. No `.gitignore` | None. `.agentic-doctor/intent.json` is declared intent, not an ignore list | Keep the built-in directory list. No new config file |

Doctor also inventories scannable files that merely sit under a harness directory (`references/*.md` inside a skill, a `README.md` under `.claude/`). Lint never treats those as the construct. That is doctor over-inventory, not a lint miss. The shared classifier should describe harness-loaded files. Narrowing doctor's extra records is a later, separate behavior change and is not required to turn the acceptance tests green.

## Other issues

| Severity | Issue |
| --- | --- |
| High | Lint misses nested `CLAUDE.md` and `AGENTS.md`, so a package-level instruction file is unchecked. This is the user-facing bug #1576 fixed for doctor |
| High | Lint misses `AGENTS.MD` and `agents.md`, including at the repository root on a case-sensitive filesystem |
| High | Lint misses `CLAUDE.md` and `AGENTS.md` inside `.github/instructions/`, so those instructions are not scored and are not Claude or shared entries for import expansion |
| Medium | Lint reports fixture files inside `.github/instructions`, `.github/agents`, and `.github/skills` (`tests/fixtures`, `testdata`, `__fixtures__`). Adding nested discovery without the same predicate would also start scoring `tests/fixtures/**/CLAUDE.md` |
| Medium | A `*.instructions.md` nine directories under `.github/instructions` is linted and absent from doctor, because depth is counted from different roots |
| Medium | Doctor silently drops a malformed `.mcp.json`. Lint reports `mcpserver/invalid-json` when `--mcp-servers` is set. `doctor --ci` can stay green on a broken MCP config |
| Low | Lint scores `*.instructions.md` under a directory named `dist`. Doctor skips `dist` |
| Low | Skill, agent, and hook discovery skip every symlink, while instruction discovery and doctor follow in-repo links. Leave this alone in the instruction fix |
| Low | Doctor inventories markdown that only happens to sit under a harness directory. Not required to go green |
| Low | Default `lint` does not look at subagents or MCP configs. Documented rollout, locked by a passing test |
| Info | `lint lessons` and doctor do not share a lessons location. Out of scope |
| Info | Rule ids for limits, skipped symlinks, and unreadable files differ. Leave them; CI scrapers know the current ids |
| Info | Running the CLI under `VITEST` hides "Discovered" and "OK" lines unless `CONSOLA_LEVEL` is at least 3. The acceptance harness sets it. Not a user-facing bug |

## Corrective design

One discovery implementation in `@lousy-agents/core`. Lint and doctor both ask it which files exist. They keep their own checks after that.

### What is shared

New gateway, `packages/core/src/gateways/agentic-artifact-discovery.ts`, plus a pure classifier next to the catalog matchers. The gateway is the only new filesystem walk. The classifier is pure and unit-tested.

The walk is the existing `walkRepository`, called once from the repository root:

- `skipDirectoryNames`: `node_modules`, `.git`, `dist`
- `skipDirectory`: the fixture predicate moved out of `packages/doctor/src/gateways/scanner.ts` into core. Same rule: `tests`/`fixtures` as a parent and child, using the scan root's own name when the relative path has no parent; `__fixtures__` and `testdata` at any depth. The start directory is never skipped
- `includeFile`: a file the classifier claims
- Symlinks: the walk's current in-repo policy
- Depth: a file is kept when its depth below the catalog root that owns it is within 10. A nested instruction file's root is the repository root. This keeps lint's deep `*.instructions.md` files and lets doctor see them too. A single global depth counted from the repository root fails the deep-file acceptance test

The classifier, given a repo-relative path, returns either nothing or:

- constructs (`instruction`, `skill`, `agent`, `subagent`, `hook`, `mcp-server`)
- `instructionFormat` when the file is an instruction
- the logical path a harness loads

Rules, in order:

1. Fixture, `dist`, `node_modules`, and `.git` never reach the classifier
2. A nested instruction filename (`CLAUDE.md`, `AGENTS.md`, `AGENTS.MD`, `agents.md` only) inside a suffix-restricted directory such as `.github/instructions/` is that instruction, not a Copilot scoped file. Format is `claude-md` or `agents-md`. Compare the filename to the set as written. Do not add `CLAUDE.MD` or a case-folded extension check
3. A nested instruction filename inside a directory another catalog entry owns (`.github/agents/CLAUDE.md`, `.claude/skills/.../AGENTS.md`) keeps that entry
4. Otherwise the best catalog match wins, as `bestMatchingEntry` does today
5. Skills are only `<skill-root>/<name>/SKILL.md`. One level, exact `SKILL.md`. Do not treat `references/*.md` as a skill
6. Agents and subagents are `.md` files under their catalog roots, any depth the walk allows, case-sensitive `.md`
7. Hook and MCP results are the catalog paths, not "any JSON under `.github/hooks`"
8. `.claude/commands` and `.codex-plugin` stay out of the lint projection. Doctor may keep reading them through footprints until command and plugin rules exist. The shared result can carry them with `lintTarget: "none"` so doctor does not need a second walk later

Harness names stay in `packages/doctor/src/entities/harness-footprints.ts`. Doctor maps a discovered path to a harness with `determineHarness`, which already knows the nested-filename and suffix-directory rules. A doctor unit test should assert that every instruction the classifier returns has the harness `determineHarness` returns. Do not move the footprint table in the first implementation. It is doctor's domain model (archetypes and findings), and core must not import doctor.

### What stays a filter after discovery

- `skills-lock.json` drops locked skills inside the skill use case. Discovery still returns them. The passing acceptance test stays
- The Copilot `preToolUse` check and the Claude `hooks` object check stay in the hook use case. Discovery still returns the three catalog files. The passing acceptance test stays
- `--subagents` and `--mcp-servers` stay flag-only. The passing acceptance test stays
- Command and plugin files are not passed to a lint use case

### How the two commands consume it

Lint's `FileSystemInstructionFileDiscoveryGateway`, skill gateway, agent gateway, subagent gateway, hook gateway, and MCP gateway stop walking on their own for the paths the shared result covers. Each use case receives the slice it already knows how to validate. Instruction format comes from the classifier, so `.github/instructions/CLAUDE.md` is `claude-md` and participates in `@` expansion. The per-target gateways can stay as the ports the use cases call; their filesystem implementation reads the shared result instead of a private walk. That keeps the use-case layer stable.

Doctor's `scanRepositoryWithReport` uses the same walk options and the same classifier for which files become inventory records. Edge parsing, archetype, and findings stay in doctor. MCP enumeration stays on `MCP_CONFIG_SOURCES`, and a JSON parse failure becomes a finding whose description names the file (the acceptance test allows either an inventory row or a finding). Do not invent a server record for a file that did not parse.

`packages/mcp` instruction tools go through the instruction gateway, so they follow lint as soon as that gateway uses the shared result. No separate MCP change beyond that.

### Behavior users will see

Not a breaking change for the CLI flags, exit-code rules, or rule ids.

Users will see:

- `lint --instructions` warns on nested `CLAUDE.md` and `AGENTS.md`, on `AGENTS.MD` and `agents.md`, and on `CLAUDE.md` / `AGENTS.md` inside `.github/instructions/`. Those warnings are the same structural-heading and quality rules used for root files. A nested `CLAUDE.md` becomes a Claude entrypoint, so its `@` imports expand. Repositories whose nested files omit the recommended headings gain warnings. Warnings do not by themselves change the exit code
- Lint stops reporting files under `tests/fixtures`, `__fixtures__`, `testdata`, and `dist`. A repository that kept a real instruction in a directory with one of those names loses those diagnostics. That is the intended match to doctor
- `doctor` inventories the deep `*.instructions.md` files lint already scores, and can raise findings on them
- `doctor` names a malformed `.mcp.json`. `doctor --ci` can start exiting 1 for a repository that today passes with a broken MCP file
- `src/fixtures`, `test/fixtures`, `spec/fixtures`, and `tests/unit/fixtures` stay in both reports. Do not add them to the skip list
- Default flags, `skills-lock.json`, the hook heuristic, command files, and symlink handling for skills and agents stay as they are

### Test strategy

The acceptance file is the guide. Implementation work does not start by editing those assertions.

For each slice, add or tighten a unit test that fails on current code, then make it pass, then re-run the acceptance file. Remove `it.fails` from a test only in the commit where that assertion passes. Expected order:

1. Core unit tests for the fixture predicate, including a scan root named `tests`, a root that is `tests/fixtures`, and `src/fixtures` staying visible
2. Core unit tests for instruction format: nested paths, `AGENTS.MD`, `agents.md`, `.github/instructions/CLAUDE.md`, `.github/agents/CLAUDE.md`, `README.md` excluded
3. Gateway test: one walk returns those files and does not return fixture or `dist` files
4. Acceptance tests for the lint misses and the fixture false positives flip from `it.fails` to `it`
5. Doctor uses the same walk. The deep-file acceptance test flips
6. Doctor MCP parse failure emits a finding. That acceptance test flips
7. The parity acceptance test flips last. It is green only when the two path sets match

Do not add a case-folding test for `CLAUDE.MD` or `SKILL.MD`. Do not skip `test/fixtures`, `spec/fixtures`, or `tests/unit/fixtures`.

### Docs

Update, in the same PR as the behavior they describe:

- `docs/lint.md` discovery table and "Differences from doctor"
- `docs/doctor.md` inventory table, the paragraph that says lint still sees only root copies, and the MCP section if a malformed file becomes a finding
- `docs/product/harness-capability-matrix.md` only if a cell's support level changes

Leave rule ids in place.

### How to split the work

The acceptance tests and this plan are the first PR. Production changes follow in four PRs, each leaving the suite green by flipping only the `it.fails` tests that PR makes pass.

1. __Shared walk options.__ Move the fixture predicate and the `dist` skip into core. Pass them from doctor's scanner and from every lint walk that already exists (`instruction` directory walks, agent markdown walk, skill directory listing). No nested filenames yet. Turns green: "should leave fixture copies inside instruction, agent, and skill roots out of lint" and "should leave a generated instruction file inside a dist directory out of both tools".
2. __Nested instructions.__ Classifier plus the instruction gateway. Lint discovers nested `CLAUDE.md` / `AGENTS.md` / `AGENTS.MD` / `agents.md`, including under `.github/instructions/` with the right format, at the scan-root cases, and still sees `src/fixtures`, `test/fixtures`, `spec/fixtures`, and `tests/unit/fixtures`. Doctor already does this; add the core unit test that pins the format so the two cannot drift. Turns green: the nested, case, `.github/instructions`, visible-fixture, and both scan-root lint tests.
3. __One walk, one depth rule.__ Doctor's scanner and lint's instruction gateway call the shared gateway. Depth is relative to the owning catalog root, which makes doctor see the deep `*.instructions.md`. Turns green: the deep-file test and the parity test.
4. __Malformed MCP.__ Doctor reports a finding that names the file. Turns green: "should surface the unreadable MCP config from lint and from doctor".

PR 3 is the large one. If the classifier from PR 2 already lives in core, PR 3 is a call-site change plus the depth rule, not a second design.

Out of this series: import expansion scope (#1517), command and plugin lint rules, lessons, case-folded extensions, symlink policy for skills and agents, `skills-lock.json`, the hook heuristic, and flag-only rollout.
