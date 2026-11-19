# Lint and doctor discovery alignment

Discovery and planning only. This branch does not change production discovery. The acceptance tests are the definition of done for the corrective work: a fix is complete when each `it.fails` below is changed back to `it` and the assertion passes.

## Does lint have the same bug?

Yes. `lint` does not see the nested instruction files that [PR #1576](https://github.com/zpratt/lousy-agents/pull/1576) taught `doctor` to inventory, and it does lint fixture copies that sit inside trees it already walks.

| Question | Answer | Evidence |
| --- | --- | --- |
| Does lint miss nested `CLAUDE.md` / `AGENTS.md`? | Yes | `it.fails` "should discover a nested CLAUDE.md and a nested AGENTS.md when lint analyzes the repository". Doctor inventories `packages/foo/CLAUDE.md` (claude) and `packages/bar/AGENTS.md` (shared). Lint's report does not name either file. The same miss shows up when the scan root is a directory named `tests` (`src/CLAUDE.md` is kept by doctor and skipped by lint) and when the scan root is `tests/fixtures` (the root `CLAUDE.md` is seen by both; `case/CLAUDE.md` is seen only by doctor). |
| Does lint lint test fixtures? | Yes, for files inside trees it already walks. Nested `CLAUDE.md` under `tests/fixtures` is not a false positive today, because lint never looks there. | `it.fails` "should leave fixture copies inside instruction, agent, and skill roots out of lint". Lint reports `.github/instructions/tests/fixtures/trap.instructions.md`, `.github/agents/testdata/trap.md`, and `.github/skills/__fixtures__/SKILL.md`. Doctor inventories none of them. A passing test locks the layouts both tools already ignore: `tests/fixtures`, `packages/bar/tests/fixtures`, `pkg/__fixtures__`, `testdata`, `node_modules`, and `dist` when the file is a `CLAUDE.md` outside a catalog walk. That passing test becomes a real guard once nested discovery is added. |
| Does lint handle `.github/instructions/`? | Only `*.instructions.md`. `CLAUDE.md` and `AGENTS.md` there are invisible. | `it.fails` "should treat CLAUDE.md and AGENTS.md inside .github/instructions as Claude and shared instructions". Doctor attributes `.github/instructions/CLAUDE.md` to claude, `.github/instructions/AGENTS.md` to shared, and `.github/agents/CLAUDE.md` to copilot. Lint does not list the first two. A passing test locks the copilot attribution of `.github/agents/CLAUDE.md` and the exclusion of `.github/instructions/README.md`. |
| Does lint handle all-caps `AGENTS.MD`? | No. `agents.md` is missed too. | Separate repositories, so a case-insensitive volume does not collapse the spellings onto one file. `it.fails` "should discover root and nested AGENTS.MD as agents-md instructions" and `it.fails` "should discover root and nested agents.md as agents-md instructions". Doctor inventories each spelling as shared. Lint's `discoveredFiles` has neither. |

The parity test is `it.fails` "should discover the same agentic paths with lint and with doctor". It compares `filesAnalyzed` from `runLint` with doctor's inventory paths. `.claude/commands/deploy.md` and `.claude/skills/example/AGENTS.md` are excluded from that comparison on purpose. The command file is doctor-only until command rules exist. The skill-directory `AGENTS.md` is a file doctor inventories because it sits under a skill root; lint must not treat it as `agents-md`, and it is not a `SKILL.md`, so lint does not analyze it. Both of those are locked by passing tests.

## Where the tests live

File: `packages/cli/src/commands/lint-doctor-discovery.acceptance.integration.test.ts`

Doctor is observed from `doctor --format json --ci`: inventory paths, finding severity and classification, and the process exit code. Lint discovery is observed from `runLint`, the public API the CLI calls, on `filesAnalyzed` and `qualityResult.discoveredFiles[].format`. Exit codes and MCP diagnostics are observed from the CLI with `--format json`, which is a flat array of `LintDiagnostic` objects. That array does not carry `discoveredFiles` or `filesAnalyzed`. `docs/lint.md` says the JSON and rdjsonl formats emit diagnostics only, with no quality-result envelope. Wrapping that array so the fields appear would break every consumer that parses an array, including the GitHub Action's reviewdog path. The tests therefore do not assert those fields on CLI JSON. Format and the analyzed set are asserted on `runLint` with exact path equality, not as substrings of human output.

The file is an integration test (`*.integration.test.ts`), so `mise run test-integration` runs it after the workspace build. Twenty tests use Vitest `it.fails` (seventeen cases plus three reserved MCP server names). The assertion is the desired behavior and fails today; Vitest records that as an expected failure, so CI stays green. When a fix makes the assertion pass, `it.fails` fails the suite until it is changed to `it`. That change is the definition of done. Do not weaken the assertion to make `it.fails` go away. Doctor behavior that already passes, including the nested-instruction rules from #1576, is an ordinary `it`. A regression of that behavior fails CI. It is not buried inside `it.fails`.

### Acceptance tests that fail today

| Test | What it proves | Observed result |
| --- | --- | --- |
| should discover a nested CLAUDE.md and a nested AGENTS.md when lint analyzes the repository | Nested instruction miss, exact `claude-md` / `agents-md` | Lint `discoveredFiles` lacks both. Doctor inventory is a separate passing test |
| should resolve an @ import written in a nested CLAUDE.md | `packages/foo/CLAUDE.md` contains `@./guide.md` | `effectiveDocuments` has no resolved import for that file |
| should discover root and nested AGENTS.MD as agents-md instructions | `AGENTS.MD` only, its own temp repo | Lint format is not `agents-md`. Doctor harness `shared` is a passing test |
| should discover root and nested agents.md as agents-md instructions | `agents.md` only, its own temp repo, including `packages/foo/agents.md` | Same split |
| should treat CLAUDE.md and AGENTS.md inside .github/instructions as Claude and shared instructions | Includes `.github/instructions/nested/CLAUDE.md` | Lint does not record `claude-md` / `agents-md`. Doctor attribution is a passing test |
| should leave fixture copies inside instruction, agent, and skill roots out of lint | False positives on walks lint already does | Those paths are in `filesAnalyzed`. Doctor exclusion is a passing test |
| should keep CLAUDE.md under src/fixtures, test/fixtures, spec/fixtures, and tests/unit/fixtures | Accepted gap stays visible | Doctor inventory is a passing test. Lint does not analyze them |
| should discover an instruction file exactly ten directories below .github/instructions in both tools | Catalog-relative depth 10. A root walk with `maxDepth` 10 cannot list this file | Lint analyzes it as `copilot-scoped`. Doctor does not inventory it |
| should leave a generated instruction file inside a dist directory out of both tools | `dist` skip | Lint analyzes it. Doctor does not |
| should leave a skill directory named dist out of both tools | `.github/skills/dist/SKILL.md` | Lint analyzes it. Doctor does not enter `dist` |
| should discover the same agentic paths with lint and with doctor | Parity of `filesAnalyzed` and inventory, minus the two intentional doctor-only paths | The sets differ by the rows above |
| should discover src/CLAUDE.md and skip fixtures when lint starts in tests | Scan root named `tests` | Lint sees neither. Doctor seeing only `src/CLAUDE.md` is a passing test |
| should discover the root and nested CLAUDE.md when lint is pointed at tests/fixtures | Pointing at a fixture still scans that tree | Lint sees the root file only. Doctor seeing both is a passing test |
| should fail doctor --ci when .mcp.json is not valid JSON | Finding names `.mcp.json`, severity high or critical, classification defect, exit 1 | No such finding. Exit is 0. An empty inventory row does not pass |
| should fail doctor --ci when .vscode/mcp.json is not valid JSON | Same contract for `.vscode/mcp.json` | Same miss |
| should fail doctor --ci when MCP JSON parses but fails the schema | `{"mcpServers":[]}` | Doctor drops it. No finding. Exit is 0 |
| should fail doctor --ci when .mcp.json names the reserved server __proto__ | Reserved name | No finding. Exit is 0 |
| should fail doctor --ci when .mcp.json names the reserved server constructor | Reserved name | No finding. Exit is 0 |
| should fail doctor --ci when .mcp.json names the reserved server prototype | Reserved name | No finding. Exit is 0 |
| should exit 1 when the only broken instruction file is a nested CLAUDE.md | `.lousy-agentsrc.json` sets `instruction/missing-structural-heading` to `error`. The only instruction file is `packages/foo/CLAUDE.md` | CLI `--format json` exits 0. The diagnostic is absent |

A file one directory past the instruction cap, `.github/instructions/1/2/3/4/5/6/7/8/9/10/11/past-limit.instructions.md`, is in a passing test: neither tool analyzes it. `walkRepository` lists a directory when its segment count is less than or equal to `maxDepth`. The at-limit parent has 12 segments, so a root walk at `maxDepth` 12 lists that file and does not list the past-limit parent, which has 13 segments. The past-limit test does not reject `maxDepth` 12. It rejects a root walk deep enough for the agent budget (`maxDepth` 34) that keeps every instruction file it lists. A root `maxDepth` of 10 never reaches the at-limit file, so that test stays red until the depth is counted from the catalog root or the root cap is at least 12 and a catalog-relative filter drops D > 10.

### Acceptance tests that pass today

These lock behavior the corrective work must not regress.

| Test | What it locks |
| --- | --- |
| should discover the root instruction files, skills, agents, hooks, and MCP configs in both tools | Root `CLAUDE.md`, `AGENTS.md`, `AGENTS.override.md`, `.claude/CLAUDE.md`, Copilot instructions, one-level `SKILL.md` roots including `.pi/prompts`, `.github/agents/reviewer.md` and `.github/agents/team/reviewer.md`, a `preToolUse` hook, `.claude/settings.json` with a `hooks` object, and both MCP configs |
| should record .github/agents/CLAUDE.md as a copilot-agent instruction and as a copilot agent | Exact format `copilot-agent`, and doctor harness `copilot` |
| should keep a nested agent file an agent and not an instruction | `.github/agents/team/reviewer.md` is in the agent `filesAnalyzed` and is absent from instruction `discoveredFiles` |
| should inventory AGENTS.md inside a skill directory as a skill and not as an agents-md instruction | Doctor `constructType` is `skill`. Lint instruction format is absent. Lint does not put the file in skill `filesAnalyzed`, because a skill file is `SKILL.md` only. See the disagreement below |
| should inventory nested CLAUDE.md and AGENTS.md | Doctor harnesses from #1576. A regression fails CI |
| should attribute CLAUDE.md and AGENTS.md inside .github/instructions to claude and shared | Includes `.github/instructions/nested/CLAUDE.md`. `README.md` there stays out |
| should leave fixture copies out of the doctor inventory | Doctor side of the fixture false-positive test |
| should leave tests/fixtures, __fixtures__, testdata, node_modules, dist, a past-limit instruction, and a non-instruction README out of both tools | Includes the file eleven directories below `.github/instructions` |
| should inventory CLAUDE.md under src/fixtures, test/fixtures, spec/fixtures, and tests/unit/fixtures | Doctor side of the accepted-gap test |
| should leave subagents and MCP configs out of a default lint run | Flag-only rollout. A full flag set does see them |
| should inventory a Claude command and leave it out of lint | Doctor inventories `.claude/commands/deploy.md`. Lint does not analyze it. The test does not assert `constructType` |
| should inventory root and nested AGENTS.MD as shared instructions | Doctor side, own temp repo |
| should inventory root and nested agents.md as shared instructions | Doctor side, own temp repo |
| should discover src/CLAUDE.md and skip fixtures when doctor starts in tests | Doctor's parent-segment fixture rule |
| should inventory the fixture tree when doctor is pointed at it | The scan root itself is never skipped |
| should omit the locked skill from lint and still inventory it in doctor | `skills-lock.json` stays a lint-only filter |
| should leave the hook file out of lint and inventory it in doctor | Copilot `preToolUse` heuristic stays a lint-only filter |
| should report malformed .mcp.json from lint and ignore it on a default lint run | `mcpserver/invalid-json`, exit 1 with `--mcp-servers`. Default `lint` exits 0 and emits no `mcp-server` diagnostic |
| should report malformed .vscode/mcp.json from lint | Same rule id, exact `filePath` |
| should report MCP JSON that parses but fails the schema from lint | `{"mcpServers":[]}` is `mcpserver/invalid-config` |
| should report a reserved MCP server name %s from lint | `__proto__`, `constructor`, and `prototype` are `mcpserver/invalid-config` |

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
| Depth | 10 from each catalog root. A file whose parent is exactly 10 directories below `.github/instructions` is analyzed. One more directory is not | 10 from the repository root. That file's parent has 12 path segments and is never listed | No |
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

The walk is the existing `walkRepository`. One invocation cannot serve both tools unchanged.

__Revisit.__ `revisit` is one policy per walk. `refuse-ancestors` returns every logical path (doctor). `once-per-real-directory` returns one path per real directory (lint). A single call cannot do both. The shared result uses `refuse-ancestors` and returns every logical path together with the real-file identity. Lint collapses that list to one path per real file, keeping the first path in code-unit order. Doctor keeps every logical path.

__Depth.__ `includeFile` receives only the file name. It cannot see the repo-relative path, so it cannot enforce a catalog-relative depth. A directory is listed when its segment count is less than or equal to `maxDepth`: the root is segment count 0, and a child is entered only when the parent's listed depth is less than `maxDepth`. `.github/instructions` has 2 segments. A file whose parent is D directories below that catalog root has a parent with 2+D segments. Doctor's root walk with `maxDepth` 10 therefore lists that file only for D ≤ 8. The acceptance file at D = 10 (parent `.github/instructions/1/2/3/4/5/6/7/8/9/10`, 12 segments) is analyzed by lint, which starts its walk at `.github/instructions` so that parent is listed at depth 10, and is absent from doctor. The file at D = 11 has a parent with 13 segments. A root walk at `maxDepth` 12 lists the D = 10 file and does not list the D = 11 file. The past-limit test stays green at `maxDepth` 12. It fails only when the walk is deep enough to list a 13-segment directory and then keeps the instruction file, which is what an unfiltered agent-depth walk (`maxDepth` 34) would do. A root `maxDepth` of 10 still cannot turn the D = 10 test green.

Chosen mechanism: __per-catalog-root walks__, plus one repository-root walk for the nested instruction filenames only.

- Each directory-prefix catalog entry is walked from that entry. `maxDepth` is the construct budget. Instructions use 10, so the catalog root is depth 0 and D = 10 is listed while D = 11 is not entered. Agents and subagents use 32, matching `markdown-file-discovery.ts`. The nested-filename walk starts at the repository root with `maxDepth` 10, which is doctor's current cap for `CLAUDE.md` and `AGENTS.md` outside a catalog root
- `skipDirectoryNames` on every walk: `node_modules`, `.git`, `dist`
- `skipDirectory`: the fixture predicate moved out of `packages/doctor/src/gateways/scanner.ts`. Same rule: `tests`/`fixtures` as a parent and child, using the scan root's own name when the relative path has no parent; `__fixtures__` and `testdata` at any depth. The start directory is never skipped
- After the walk, the classifier drops paths it does not claim. `includeFile` may stay name-based (`*.md`, `*.instructions.md`) because the path rules run on `WalkedFile.relativePath`

Alternative, if one traversal is preferred: one `refuse-ancestors` walk from the repository root with `maxDepth` at least `segmentCount(catalogRoot) + budget`. For instructions that is 2 + 10 = 12. For agents that is 2 + 32 = 34. `maxDepth` 12 by itself lists the at-limit instruction file and does not list the past-limit one, so the past-limit acceptance test does not force the filter at that cap. The filter is required once `maxDepth` is 13 or more: drop any instruction file with D > 10 and any agent or subagent file with D > 32. That filter cannot live in `includeFile`. Lint still collapses logical paths to real files. The D = 10 test rejects a short root cap. The D = 11 test rejects an unfiltered walk that lists 13-segment directories. Per-catalog-root walks are the ones to build, because a depth-34 root walk reopens the alias fan-out the entry budget exists to bound.

The classifier, given a repo-relative path, returns either nothing or:

- constructs (`instruction`, `skill`, `agent`, `subagent`, `hook`, `mcp-server`)
- `instructionFormat` when the file is an instruction
- the logical path a harness loads

Rules, in order:

1. Fixture, `dist`, `node_modules`, and `.git` never reach the classifier
2. A nested instruction filename (`CLAUDE.md`, `AGENTS.md`, `AGENTS.MD`, `agents.md` only) inside a suffix-restricted directory such as `.github/instructions/` is that instruction, not a Copilot scoped file. Format is `claude-md` or `agents-md`. Compare the filename to the set as written. Do not add `CLAUDE.MD` or a case-folded extension check
3. A nested instruction filename inside a directory another catalog entry owns (`.github/agents/CLAUDE.md`, `.claude/skills/.../AGENTS.md`) keeps that entry
4. Otherwise the best catalog match wins, as `bestMatchingEntry` does today
5. Skills are only `<skill-root>/<name>/SKILL.md`. One level, exact `SKILL.md`. Do not treat `references/*.md` or `.claude/skills/example/AGENTS.md` as a skill file lint analyzes. That `AGENTS.md` must also not become `agents-md`: the skill directory already owns it. Doctor already records `constructType: "skill"`. The passing test locks both sides. It does not ask lint to add the file to skill `filesAnalyzed`
6. Agents and subagents are case-sensitive `.md` files under their catalog roots, up to 32 directories below that root. A nested `.github/agents/**/*.md` such as `.github/agents/team/reviewer.md` is an agent and not an instruction. Instruction dual-use stays the top-level files `.github/agents/*.md` only, so `.github/agents/CLAUDE.md` remains `copilot-agent` and the nested reviewer file has no instruction format
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

Doctor's `scanRepositoryWithReport` uses the same walks and the same classifier for which files become inventory records. Edge parsing, archetype, and findings stay in doctor. MCP enumeration stays on `MCP_CONFIG_SOURCES`. A file that is not valid JSON, JSON that parses but fails the server schema (`{"mcpServers":[]}`), or a server named `__proto__`, `constructor`, or `prototype`, becomes one finding. The finding's description or `targetId` contains the repo-relative path (`.mcp.json` or `.vscode/mcp.json`). Severity is `high` or `critical` and classification is `defect`, so `doctor --format json --ci` exits 1. An inventory row with no server, and an exit of 0, do not satisfy the acceptance test. Do not invent a server record for a file that did not parse.

`packages/mcp` instruction tools go through the instruction gateway, so they follow lint as soon as that gateway uses the shared result. No separate MCP change beyond that.

### Behavior users will see

CLI flags do not change. These lint rule ids stay the same, including `instruction/missing-structural-heading`, `instruction/import-unresolved`, `mcpserver/invalid-json`, and `mcpserver/invalid-config`. No new lint rule id is required for nested discovery. Doctor's existing finding ids stay. The malformed-MCP case is a new doctor finding id; the acceptance test does not pin the id, it pins the path, the severity, the classification, and the exit code.

Exit codes:

- At default severities, every instruction rule is `warn`. Newly discovered nested files add warnings. Lint's exit code stays 0, and the GitHub Action stays 0, because `packages/action/src/index.ts` sets exit 1 only when `hasErrors` is true
- A project that sets an instruction rule to `error` in `lousy-agents` config, including `instruction/missing-structural-heading`, gets exit 1 from lint and from the Action as soon as a nested file violates that rule. The acceptance test configures that rule as `error` with only `packages/foo/CLAUDE.md` present and expects exit 1. Today that command exits 0
- `doctor --format json --ci` exits 1 only for a finding whose severity is `critical` or `high` and whose classification is `defect`. A medium or advisory finding does not change the exit code. The new MCP finding is specified as high or critical and `defect`, so a repository whose only problem is a broken `.mcp.json` or `.vscode/mcp.json` goes from exit 0 to exit 1. That is the doctor exit change. Lint rule ids do not change with it. A valid MCP config must not get that finding: the layout acceptance test locks both paths, and a finding is named only when the path matches as a whole path, not as a substring (a longer path such as `pkg/.mcp.json` must not satisfy a check for `.mcp.json`)
- Widening agent and subagent discovery from the root walk's segment cap of 10 to 32 directories below the catalog root inventories claude-owned files today's scan never reaches, including deep files under `.claude/agents`. `malformed-claude-import` is severity `high` and classification `defect`. A missing `@` import in one of those newly inventoried files makes `doctor --ci` exit 1 where it exits 0 today. That exit change belongs to the PR that raises the agent depth, and it is separate from the MCP finding
- Default `lint`, with no `--mcp-servers`, still does not read MCP configs. A broken MCP file stays invisible to that command and does not change its exit code. `--mcp-servers` already exits 1 for invalid JSON, a schema failure, and a reserved server name. Those lint behaviors are passing tests

Users will also see:

- `lint --instructions` warns, at the default severity, on nested `CLAUDE.md` and `AGENTS.md`, on `AGENTS.MD` and `agents.md`, and on `CLAUDE.md` / `AGENTS.md` inside `.github/instructions/`. A nested `CLAUDE.md` becomes a Claude entrypoint, so `@./guide.md` beside it resolves. The import acceptance test locks that and nothing else
- Lint stops reporting files under `tests/fixtures`, `__fixtures__`, `testdata`, and `dist`, including `.github/skills/dist/SKILL.md` and `.github/instructions/dist/generated.instructions.md`
- Doctor inventories the instruction file exactly ten directories below `.github/instructions` and still ignores the file eleven directories below it
- `src/fixtures`, `test/fixtures`, `spec/fixtures`, and `tests/unit/fixtures` stay in both reports. Do not add them to the skip list
- Default flags, `skills-lock.json`, the hook heuristic, command files, and skip-all-symlinks for skills, agents, and hooks stay as they are. An in-repo symlink of a skill directory stays out of lint and in the doctor inventory. An in-repo symlink of `CLAUDE.md` stays an analyzed `claude-md` file. Those two are passing acceptance tests
- Doctor's agent and subagent inventory grows from "parent segment count ≤ 10" to 32 directories below `.github/agents` or `.claude/agents`. Files in that new range become inventory records. Under `.claude/` they are claude files, so a missing `@` import is `malformed-claude-import` and can fail `doctor --ci`

### Test strategy

The acceptance file is the guide. Implementation work does not start by editing those assertions.

For each slice, add or tighten a unit test that fails on current code, then make it pass, then re-run the acceptance file. Remove `it.fails` from a test only in the commit where that assertion passes. Expected order:

1. Core unit tests for the fixture predicate, including a scan root named `tests`, a root that is `tests/fixtures`, and `src/fixtures` staying visible
2. Core unit tests for instruction format: nested paths, `AGENTS.MD`, `agents.md`, `.github/instructions/CLAUDE.md`, `.github/agents/CLAUDE.md`, `README.md` excluded
3. Gateway test: per-catalog-root walks return the depth-10 instruction file, do not return the depth-11 file, and do not return fixture or `dist` files. A unit test that the shared result contains two logical paths for one real file, and that the lint projection keeps one
4. Acceptance tests for the lint misses, the fixture false positives, the depth-10 file, and the nested `@` import flip from `it.fails` to `it`
5. Doctor uses the same walks. The depth-10 acceptance test flips. The past-limit test stays an ordinary `it`
6. Skills, agents, subagents, hooks, and MCP read the shared result. The nested-agent test stays an ordinary `it`. The `dist` skill test has already flipped with the skip options
7. Doctor MCP findings flip their `it.fails` tests
8. The parity acceptance test flips last. It is green only when the two path sets match, still excluding the command file and the skill-directory `AGENTS.md`

Do not add a case-folding test for `CLAUDE.MD` or `SKILL.MD`. Do not skip `test/fixtures`, `spec/fixtures`, or `tests/unit/fixtures`.

### Docs

Update, in the same PR as the behavior they describe:

- `docs/lint.md` discovery table and "Differences from doctor"
- `docs/doctor.md` inventory table, the paragraph that says lint still sees only root copies, and the MCP section if a malformed file becomes a finding
- `docs/product/harness-capability-matrix.md` only if a cell's support level changes

Lint rule ids stay as they are. Doctor gains one finding id for a config that does not parse into servers. Do not rename `instruction/discovery-limit-reached` or `discovery-limit-reached`.

### How to split the work

The acceptance tests and this plan are the first PR. Production changes follow in five PRs, each leaving the suite green by flipping only the `it.fails` tests that PR makes pass.

1. __Shared skip options on the walks that already exist.__ Move the fixture predicate and the `dist` name skip into core. Pass them from doctor's scanner and from lint's instruction walk, agent markdown walk, and skill directory listing. No nested filenames yet. Turns green: "should leave fixture copies inside instruction, agent, and skill roots out of lint", "should leave a generated instruction file inside a dist directory out of both tools", and "should leave a skill directory named dist out of both tools".
2. __Nested instructions.__ Classifier plus the instruction gateway, still on instruction paths only. Lint discovers nested `CLAUDE.md` / `AGENTS.md` / `AGENTS.MD` / `agents.md`, including `.github/instructions/nested/CLAUDE.md`, with the exact format, and expands `@./guide.md` from `packages/foo/CLAUDE.md`. Scan-root cases and the accepted fixture layouts stay visible. Turns green: the nested, import, case, `.github/instructions`, visible-fixture, and both scan-root lint tests, the configured-error exit test, and "should warn on a nested CLAUDE.md and still exit 0". Does not flip the 10-segment `CLAUDE.md` test; that file stays outside this PR's walk.
3. __Per-catalog-root instruction walks.__ Doctor and lint instruction discovery call the shared gateway. Instruction depth is 10 from the catalog root. The nested-filename walk lists a directory when its segment count is ≤ 10. The result is every logical path; lint collapses to one path per real file. Turns green: the catalog depth-10 test, "should discover a CLAUDE.md whose parent has 10 segments as claude-md", and the parity test. The past-limit test and "should leave a CLAUDE.md whose parent has 11 segments out of both tools" stay ordinary `it`s.
4. __Other constructs on the shared result.__ Skills, agents, subagents, hooks, and MCP stop using private walkers and read the shared result. Post-filters stay: `skills-lock.json`, the hook content heuristic, flag-only `--subagents` and `--mcp-servers`, and skip-all-symlinks for skills, agents, and hooks. Agent and subagent depth is 32 from their catalog root, which is wider than doctor's current root cap and can add `malformed-claude-import` failures. Nested `.github/agents/**/*.md` stays an agent, not an instruction. The passing tests for the nested agent, the skill-directory `AGENTS.md`, the lock file, the hook heuristic, the symlinks, and the default flags stay ordinary `it`s. Parity is already green after PR 3; this PR keeps it green.
5. __Malformed MCP findings.__ Doctor emits the blocking finding for `.mcp.json`, `.vscode/mcp.json`, schema-invalid JSON, and the three reserved server names. Turns green: those `it.fails` tests.

PR 3 and PR 4 are the large ones. By the paths in the acceptance repository, PR 3 is what makes the two sets match: after the fixture and `dist` skips and the nested-instruction discovery, the only remaining path difference is the catalog-depth-10 instruction file plus the 10-segment `CLAUDE.md`, both of which PR 3 adds to the side that lacks them. PR 4 keeps that parity green while moving the other constructs. The MCP findings are not part of the path comparison.

Out of this series: import expansion scope beyond making a nested `CLAUDE.md` an entrypoint (#1517 still covers transitive scope inside imported files), command and plugin lint rules, lessons, case-folded extensions, changing skip-all-symlinks for skills and agents, and promoting flag-only targets to default-on.
