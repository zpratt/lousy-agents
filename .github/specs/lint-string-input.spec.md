# Feature: Lint API String Input Support

## Problem Statement

The `@lousy-agents/lint` public API currently requires a filesystem directory path to discover and analyze skill, agent, instruction, and hook configuration files. This makes it unusable in browser-based environments (e.g., interactive web apps or playgrounds) where users want to paste or type content and receive immediate lint feedback without a backing filesystem. A new API entry point is needed that accepts string content directly, enabling browser-hosted lint experiences.

## Personas

| Persona | Impact | Notes |
| --- | --- | --- |
| Web App Developer | Positive | Primary user — can integrate lint into browser-based tools, playgrounds, and preview UIs |
| Software Engineer Learning Vibe Coding | Positive | Gets interactive lint feedback in a web UI without needing a local project |
| CLI/Action Consumer | Neutral | Existing `runLint` API and CLI remain unchanged |

## Value Assessment

- **Primary value**: Market — Opens the lint API to browser-based consumers, enabling interactive web experiences that attract new users
- **Secondary value**: Customer — Existing users gain a programmatic way to lint individual files or snippets without scaffolding a project directory

## User Stories

### Story 1: Lint a Single Skill from String Content

As a **Web App Developer**,
I want **to pass skill file content as a string to the lint API**,
so that I can **validate user-provided skill definitions in my web app without a filesystem**.

#### Acceptance Criteria

- When `lintContent` is called with a `skills` input containing a `name` and `content` string, the lint API shall analyze the content and return `LintResult` with skill diagnostics.
- When `lintContent` is called with a `skills` input that omits the `name` field, the lint API shall reject with a `LintValidationError`.
- The `name` field shall match `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$` (no path separators, no control characters, no Unicode bidirectional overrides). If the `name` field fails format validation, then the lint API shall reject with a `LintValidationError`.
- When the skill content is an empty string, the lint API shall return diagnostics indicating missing frontmatter.
- If the skill content contains control characters (ASCII C0 0x00–0x1F except tab 0x09, newline 0x0A, and carriage return 0x0D; DEL 0x7F; C1 0x80–0x9F; Unicode line/paragraph separators 0x2028–0x2029; and bidirectional overrides 0x202A–0x202E, 0x2066–0x2069), then the lint API shall reject with a `LintValidationError`.

#### Notes

- The `name` field serves as a virtual filename for diagnostics (e.g., `my-skill.md:3 [name]: ...`) and is used as `skillName` in the discovered skill entry.
- The `skill/name-mismatch` rule may fire if the input `name` does not match the frontmatter `name` field, which is correct behavior — the user can fix the mismatch in their content.
- The control character validation utility is extracted to `packages/core/src/lib/control-chars.ts` and reused by both `validate-content.ts` and `validate-directory.ts`.

---

### Story 2: Lint a Single Agent from String Content

As a **Web App Developer**,
I want **to pass agent file content as a string to the lint API**,
so that I can **validate user-provided agent definitions in my web app**.

#### Acceptance Criteria

- When `lintContent` is called with an `agents` input containing a `name` and `content` string, the lint API shall analyze the content and return `LintResult` with agent diagnostics.
- When the agent content has no YAML frontmatter, the lint API shall return an error diagnostic at line 1.
- If the `name` field is an empty string or does not match the `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$` format, then the lint API shall reject with a `LintValidationError`.
- If the agent content contains control characters (same range as Story 1), then the lint API shall reject with a `LintValidationError`.

#### Notes

- The `name` field is used as `agentName` in the discovered agent entry. The `agent/name-mismatch` rule may fire if the input `name` does not match the frontmatter `name` field.
- The same `name` format validation applies across all target types.

---

### Story 3: Lint a Single Instruction from String Content

As a **Web App Developer**,
I want **to pass instruction file content as a string to the lint API**,
so that I can **preview instruction quality analysis without saving a file to disk**.

#### Acceptance Criteria

- When `lintContent` is called with an `instructions` input containing a `name`, `content` string, and `format` specifier, the lint API shall analyze the content and return `LintResult` with instruction quality diagnostics.
- When the instruction content is valid markdown with structural headings and code blocks, the lint API shall return a quality score and suggestions.
- If the `format` field is not a valid `InstructionFileFormat`, then the lint API shall reject with a `LintValidationError`.
- If the instruction content contains control characters (same range as Story 1), then the lint API shall reject with a `LintValidationError`.

#### Notes

- Feedback loop command discovery is not possible without a project directory. The use case shall use an empty command list in string mode.
- Quality scoring still works because it analyzes structural context, execution clarity, and loop completeness within the provided content.

---

### Story 4: Lint a Single Hook Configuration from String Content

As a **Web App Developer**,
I want **to pass hook configuration JSON as a string to the lint API**,
so that I can **validate hook configurations interactively**.

#### Acceptance Criteria

- When `lintContent` is called with a `hooks` input containing a `name`, `content` string, and `platform` specifier (`"copilot"` or `"claude"`), the lint API shall analyze the content and return `LintResult` with hook diagnostics.
- If the hook content is not valid JSON, then the lint API shall return a diagnostic with rule ID `hook/invalid-json`.
- If the `platform` field is not `"copilot"` or `"claude"`, then the lint API shall reject with a `LintValidationError`.
- If the hook content contains control characters (same range as Story 1), then the lint API shall reject with a `LintValidationError`.

---

### Story 5: Lint Multiple Targets in a Single Call

As a **Web App Developer**,
I want **to lint multiple string inputs in a single `lintContent` call**,
so that I can **validate a complete set of agent artifacts at once**.

#### Acceptance Criteria

- When `lintContent` is called with multiple target arrays (e.g., both `skills` and `agents`), the lint API shall return separate `LintOutput` entries for each target.
- When `lintContent` is called with no inputs (all arrays empty or omitted), the lint API shall reject with a `LintValidationError`.
- If any target array contains duplicate `name` values, the lint API shall reject with a `LintValidationError`.
- The `LintResult.hasErrors` shall be true if any target produced error-severity diagnostics.

---

### Story 6: Input Size Limits

As a **Web App Developer**,
I want **the lint API to enforce reasonable size limits on string inputs**,
so that I can **protect my web app from denial-of-service via oversized payloads**.

#### Acceptance Criteria

- If a single content string exceeds 1 MB (1,048,576 bytes measured using `new TextEncoder().encode(content).byteLength` for browser compatibility, or `Buffer.byteLength(content, 'utf8')` in Node.js), then the lint API shall reject with a `LintValidationError`.
- The total combined size of all content strings across all targets shall not exceed 10 MB (10,485,760 bytes, same measurement method). If the combined size exceeds 10 MB, the lint API shall reject with a `LintValidationError`.
- The lint API shall enforce a maximum of 100 items across all target arrays combined per call.

---

## Design

> Refer to `.github/copilot-instructions.md` and `.github/instructions/software-architecture.instructions.md` for technical standards.

### Components Affected

- `packages/lint/src/lint-content.ts` (new) — New composition root for string-based linting
- `packages/lint/src/lint-content.test.ts` (new) — Tests for the new API
- `packages/lint/src/validate-content.ts` (new) — Input validation for string content
- `packages/lint/src/validate-content.test.ts` (new) — Tests for input validation
- `packages/lint/src/index.ts` — Export `lintContent` and `LintContentOptions` types
- `packages/lint/src/index.d.ts` — Add type declarations for `lintContent` API
- `packages/core/src/lib/control-chars.ts` (new) — Parameterised control character validator shared by `validate-content.ts` and `validate-directory.ts`
- `packages/core/src/gateways/in-memory-skill-lint-gateway.ts` (new) — In-memory skill lint gateway
- `packages/core/src/gateways/in-memory-agent-lint-gateway.ts` (new) — In-memory agent lint gateway
- `packages/core/src/gateways/in-memory-hook-config-gateway.ts` (new) — In-memory hook config gateway
- `packages/core/src/gateways/in-memory-instruction-gateways.ts` (new) — In-memory instruction discovery and feedback loop commands gateways

**Note**: No use-case files are modified. All adaptation is in gateway implementations. The existing use cases operate identically on in-memory content because they depend on gateway port interfaces, not concrete filesystem implementations.

### Dependencies

- No new external dependencies required
- Uses existing `zod` for input validation
- Uses existing use-case classes and their gateway interfaces

### Data Model Changes

New types for the string input API:

```typescript
interface ContentInput {
    readonly name: string;     // Virtual filename for diagnostics
    readonly content: string;  // Raw file content
}

interface SkillContentInput extends ContentInput {}

interface AgentContentInput extends ContentInput {}

interface InstructionContentInput extends ContentInput {
    readonly format: InstructionFileFormat;
}

interface HookContentInput extends ContentInput {
    readonly platform: "copilot" | "claude";
}

interface LintContentOptions {
    readonly skills?: readonly SkillContentInput[];
    readonly agents?: readonly AgentContentInput[];
    readonly instructions?: readonly InstructionContentInput[];
    readonly hooks?: readonly HookContentInput[];
}
```

### Diagrams

#### Data Flow Diagram

```mermaid
flowchart TB
    subgraph Consumer["Web App (Consumer)"]
        WEBAPP["Browser UI"]
    end
    subgraph LintAPI["@lousy-agents/lint"]
        LC["lintContent()"]
        VALIDATE["validateContentInputs()"]
    end
    subgraph UseCases["Use Cases Layer"]
        SKILL_UC["LintSkillFrontmatterUseCase"]
        AGENT_UC["LintAgentFrontmatterUseCase"]
        HOOK_UC["LintHookConfigUseCase"]
        INSTR_UC["AnalyzeInstructionQualityUseCase"]
    end
    subgraph InMemGateways["In-Memory Gateways"]
        SKILL_GW["InMemorySkillLintGateway"]
        AGENT_GW["InMemoryAgentLintGateway"]
        HOOK_GW["InMemoryHookConfigGateway"]
        INSTR_DISC_GW["InMemoryInstructionDiscoveryGateway"]
        AST_GW["RemarkMarkdownAstGateway (reused)"]
        CMD_GW["InMemoryFeedbackLoopCommandsGateway"]
    end

    WEBAPP -->|"LintContentOptions"| LC
    LC --> VALIDATE
    VALIDATE -->|"validated inputs"| LC
    LC -->|"skill strings"| SKILL_UC
    LC -->|"agent strings"| AGENT_UC
    LC -->|"hook strings"| HOOK_UC
    LC -->|"instruction strings"| INSTR_UC
    SKILL_UC --> SKILL_GW
    AGENT_UC --> AGENT_GW
    HOOK_UC --> HOOK_GW
    INSTR_UC --> INSTR_DISC_GW
    INSTR_UC --> AST_GW
    INSTR_UC --> CMD_GW
    LC -->|"LintResult"| WEBAPP
```

#### Sequence Diagram

```mermaid
sequenceDiagram
    participant WebApp as Browser Web App
    participant LC as lintContent()
    participant V as validateContentInputs()
    participant SUC as LintSkillFrontmatterUseCase
    participant SGW as InMemorySkillLintGateway
    participant Filter as applySeverityFilter()

    WebApp->>LC: lintContent({ skills: [{ name, content }] })
    LC->>V: validate inputs (Zod schemas, size, control chars)
    V-->>LC: validated inputs

    LC->>SGW: create from skill inputs
    LC->>SUC: new LintSkillFrontmatterUseCase(SGW)
    LC->>SUC: execute({ targetDir: "<in-memory>" })
    SUC->>SGW: discoverSkills("<in-memory>")
    SGW-->>SUC: [{ filePath: name, skillName: name }]
    loop For each skill
        SUC->>SGW: readSkillFileContent(filePath)
        SGW-->>SUC: content string
        SUC->>SUC: parseFrontmatter + validate
    end
    SUC-->>LC: LintSkillFrontmatterOutput

    LC->>LC: toLintOutput(output, "skill", count)
    LC->>Filter: applySeverityFilter(output, DEFAULT_LINT_RULES)
    Filter-->>LC: filtered LintOutput
    LC-->>WebApp: LintResult { outputs, hasErrors }
```

### Strategy: In-Memory Gateways

The existing use cases accept gateway interfaces (ports) via constructor injection. The string input API creates **in-memory gateway implementations** in `packages/core/src/gateways/` (alongside the existing filesystem gateways) that serve content from the provided strings instead of reading from disk:

1. **InMemorySkillLintGateway** (`packages/core/src/gateways/in-memory-skill-lint-gateway.ts`) implements `SkillLintGateway` — `discoverSkills()` returns entries with `skillName` set to the user-supplied input `name` (no frontmatter parsing at discovery time); `readSkillFileContent()` returns the corresponding string. If YAML frontmatter parsing throws during `discoverSkills()`, the gateway shall catch the error and use the input `name` as the fallback so `discoverSkills()` never throws for bad content.
2. **InMemoryAgentLintGateway** (`packages/core/src/gateways/in-memory-agent-lint-gateway.ts`) implements `AgentLintGateway` — same pattern. `agentName` is set to the user-supplied input `name`.
3. **InMemoryHookConfigGateway** (`packages/core/src/gateways/in-memory-hook-config-gateway.ts`) implements `HookConfigLintGateway` — `discoverHookFiles()` returns entries from input; `readFileContent()` returns the string.
4. **InMemoryInstructionDiscoveryGateway** (`packages/core/src/gateways/in-memory-instruction-gateways.ts`) implements `InstructionFileDiscoveryGateway` — returns discovered files from input array.
5. **InMemoryFeedbackLoopCommandsGateway** (same file) implements `FeedbackLoopCommandsGateway` — returns an empty command list (no project directory to scan).
6. **RemarkMarkdownAstGateway** is reused as-is — its `parseContent()` method already works with strings.

This approach requires zero changes to use-case business logic. The use cases are unaware they are operating on in-memory content vs. filesystem content.

### Lint Rule Configuration in String Mode

Without a project directory, there is no `lousy-agents.config.json` to load. The `lintContent` API shall use `DEFAULT_LINT_RULES` as the severity configuration. A future enhancement could accept an optional `rules` parameter.

### Open Questions

- [x] Should `lintContent` accept a `rules` override parameter? — Deferred to future work. Use `DEFAULT_LINT_RULES` for the initial implementation.
- [x] Should `skill/name-mismatch` and `agent/name-mismatch` rules be suppressed in string mode? — No. The in-memory gateway sets `skillName`/`agentName` to the user-supplied input `name`. If the user's content has a frontmatter `name` that differs from the input `name`, the mismatch rule fires correctly and provides useful feedback. No business logic manipulation in the gateway layer.

---

## Tasks

> Each task should be completable in a single coding agent session.
> Tasks are sequenced by dependency. Complete in order unless noted.

### Task 0: Extract shared control character validator

**Objective**: Extract a parameterised `createControlCharValidator(exemptions?)` utility to `packages/core/src/lib/control-chars.ts` and update `validate-directory.ts` to import it.

**Context**: This prevents duplicate security-critical character-detection logic. Both `validate-directory.ts` (no exemptions) and the new `validate-content.ts` (exempts tab/LF/CR) configure the same validator with different exemption sets. One implementation, one patch surface.

**Affected files**:
- `packages/core/src/lib/control-chars.ts` (new)
- `packages/core/src/lib/control-chars.test.ts` (new)
- `packages/lint/src/validate-directory.ts` — update to import from `control-chars.ts`

**Requirements**:
- The `createControlCharValidator(exemptions?: ReadonlySet<number>)` function shall return a `(s: string) => boolean` that returns `true` if `s` contains any control character not in the exemption set.
- The character set shall cover: ASCII C0 (0x00–0x1F), DEL (0x7F), C1 (0x80–0x9F), Unicode line/paragraph separators (0x2028–0x2029), and bidirectional overrides (0x202A–0x202E, 0x2066–0x2069).
- Because Biome's `noControlCharactersInRegex` rule prevents regex literals for these ranges, the implementation shall use `charCodeAt()`.
- The existing `containsControlCharacters()` in `validate-directory.ts` shall delegate to `createControlCharValidator(new Set())` (no exemptions) so observable behavior is unchanged.

**Verification**:
- [ ] `npm test packages/core/src/lib/control-chars.test.ts` passes
- [ ] `npx biome check packages/core/src/lib/control-chars.ts` passes
- [ ] `npm test packages/lint/` passes (no regression in `validate-directory.ts`)

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] `validate-directory.ts` imports from `control-chars.ts`
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 1: Add content input validation module

**Objective**: Create `validate-content.ts` with Zod schemas and validation logic for string inputs.

**Context**: This module validates `LintContentOptions` before content reaches use cases. It enforces size limits, control character rejection, name format validation, and item count limits. It imports `createControlCharValidator` from Task 0.

**Depends on**: Task 0

**Affected files**:
- `packages/lint/src/validate-content.ts` (new)
- `packages/lint/src/validate-content.test.ts` (new)

**Requirements**:
- When `lintContent` is called with a content string exceeding 1 MB, the lint API shall reject with a `LintValidationError` (Story 6).
- If a content string contains control characters (using the shared `createControlCharValidator` from `packages/core/src/lib/control-chars.ts` with tab/LF/CR exemptions), then the lint API shall reject with a `LintValidationError` (Story 1).
- The validation function shall check the per-item 1 MB size limit before scanning for control characters. The 10 MB aggregate size check shall execute before any per-item control character scans. (This ensures O(1) size checks short-circuit before O(n) character scans.)
- When a `name` field is empty or does not match `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$`, the lint API shall reject with a `LintValidationError` (Stories 1, 2).
- When the total combined size of all content strings exceeds 10 MB, the lint API shall reject with a `LintValidationError` (Story 6).
- When the total item count across all targets exceeds 100, the lint API shall reject with a `LintValidationError` (Story 6).
- When all input arrays are empty or omitted, the lint API shall reject with a `LintValidationError` (Story 5).
- If a `hooks` input has an invalid `platform` value, then the lint API shall reject with a `LintValidationError` (Story 4).
- If an `instructions` input has an invalid `format` value, then the lint API shall reject with a `LintValidationError` (Story 3).
- If any target array contains duplicate `name` values, the lint API shall reject with a `LintValidationError` (Story 5).

**Verification**:
- [ ] `npm test packages/lint/src/validate-content.test.ts` passes
- [ ] `npx biome check packages/lint/src/validate-content.ts` passes

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Acceptance criteria from Stories 1–6 (input validation paths) satisfied
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 2a: Create in-memory skill and agent gateways

**Objective**: Create in-memory gateways for skill and agent lint that implement existing use-case port interfaces using provided string content.

**Context**: These gateways enable the skill and agent use cases to operate on string inputs without filesystem access. They populate `skillName`/`agentName` with the user-supplied input `name` — no frontmatter manipulation. The `skill/name-mismatch` and `agent/name-mismatch` rules may fire if the user's content frontmatter name differs from the input `name`, which is correct and useful behavior.

**Depends on**: None (can run in parallel with Task 1)

**Affected files**:
- `packages/core/src/gateways/in-memory-skill-lint-gateway.ts` (new)
- `packages/core/src/gateways/in-memory-skill-lint-gateway.test.ts` (new)
- `packages/core/src/gateways/in-memory-agent-lint-gateway.ts` (new)
- `packages/core/src/gateways/in-memory-agent-lint-gateway.test.ts` (new)

**Requirements**:
- The `InMemorySkillLintGateway` shall implement `SkillLintGateway` and return content from the provided string inputs.
- The `InMemoryAgentLintGateway` shall implement `AgentLintGateway` and return content from the provided string inputs.
- The `discoverSkills()` method shall set `skillName` to the user-supplied input `name` (not the parsed frontmatter `name`).
- The `discoverAgents()` method shall set `agentName` to the user-supplied input `name` (not the parsed frontmatter `name`).
- When `readSkillFileContent` or `readAgentFileContent` is called with an unknown name, the gateway shall throw an error.
- If YAML frontmatter parsing throws during `discoverSkills()` or `discoverAgents()`, the gateway shall catch the exception and return the entry with the user-supplied input `name` as the fallback, so that `discoverSkills()` and `discoverAgents()` never throw for malformed content.

**Verification**:
- [ ] `npm test packages/core/src/gateways/in-memory-skill-lint-gateway.test.ts` passes
- [ ] `npm test packages/core/src/gateways/in-memory-agent-lint-gateway.test.ts` passes
- [ ] `npx biome check packages/core/src/gateways/in-memory-skill-lint-gateway.ts` passes
- [ ] `npx biome check packages/core/src/gateways/in-memory-agent-lint-gateway.ts` passes

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Each in-memory gateway correctly implements its port interface
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 2b: Create in-memory hook, instruction, and commands gateways

**Objective**: Create in-memory gateways for hook config, instruction discovery, and feedback loop commands.

**Context**: These gateways complete the set of in-memory adapters needed for all lint targets. The instruction gateways are simpler because they don't need name-mismatch handling.

**Depends on**: None (can run in parallel with Task 1)
**Affected files**:
- `packages/core/src/gateways/in-memory-hook-config-gateway.ts` (new)
- `packages/core/src/gateways/in-memory-hook-config-gateway.test.ts` (new)
- `packages/core/src/gateways/in-memory-instruction-gateways.ts` (new)
- `packages/core/src/gateways/in-memory-instruction-gateways.test.ts` (new)

**Requirements**:
- The `InMemoryHookConfigGateway` shall implement `HookConfigLintGateway` and return content from the provided string inputs.
- The `InMemoryInstructionDiscoveryGateway` shall implement `InstructionFileDiscoveryGateway` and return discovered files from the provided string inputs.
- The `InMemoryFeedbackLoopCommandsGateway` shall implement `FeedbackLoopCommandsGateway` and return an empty command list.
- When `readFileContent` is called with an unknown name, the gateway shall throw an error.

**Verification**:
- [ ] `npm test packages/core/src/gateways/in-memory-hook-config-gateway.test.ts` passes
- [ ] `npm test packages/core/src/gateways/in-memory-instruction-gateways.test.ts` passes
- [ ] `npx biome check packages/core/src/gateways/in-memory-hook-config-gateway.ts` passes
- [ ] `npx biome check packages/core/src/gateways/in-memory-instruction-gateways.ts` passes

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Each in-memory gateway correctly implements its port interface
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 3: Create `lintContent` composition root

**Objective**: Create the `lintContent` function that wires in-memory gateways to existing use cases and produces `LintResult`.

**Context**: This is the main entry point for string-based linting. It mirrors the structure of `runLint` but uses in-memory gateways instead of filesystem gateways.

**Depends on**: Task 0, Task 1, Task 2a, Task 2b

**Affected files**:
- `packages/lint/src/lint-content.ts` (new)
- `packages/lint/src/lint-content.test.ts` (new)

**Requirements**:
- When `lintContent` is called with valid skill inputs, the lint API shall return `LintResult` with skill diagnostics (Story 1).
- When `lintContent` is called with valid agent inputs, the lint API shall return `LintResult` with agent diagnostics (Story 2).
- When `lintContent` is called with valid instruction inputs, the lint API shall return `LintResult` with instruction quality diagnostics (Story 3).
- When `lintContent` is called with valid hook inputs, the lint API shall return `LintResult` with hook diagnostics (Story 4).
- When `lintContent` is called with multiple target types, the lint API shall return separate `LintOutput` entries for each (Story 5).
- The lint API shall apply `DEFAULT_LINT_RULES` severity filtering to all outputs.
- The `LintResult.hasErrors` shall be true if any output has error-severity diagnostics.

**Verification**:
- [ ] `npm test packages/lint/src/lint-content.test.ts` passes
- [ ] `npx biome check packages/lint/src/lint-content.ts` passes

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Acceptance criteria from Stories 1–5 satisfied
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 4: Export `lintContent` from public API and update type declarations

**Objective**: Export `lintContent` and all associated types from the package entry point and hand-authored `.d.ts` file.

**Context**: This makes the new API available to consumers who `import` from `@lousy-agents/lint`.

**Depends on**: Task 3

**Affected files**:
- `packages/lint/src/index.ts`
- `packages/lint/src/index.d.ts`

**Requirements**:
- The `lintContent` function shall be exported from `@lousy-agents/lint`.
- The `LintContentOptions`, `ContentInput`, `SkillContentInput`, `AgentContentInput`, `InstructionContentInput`, and `HookContentInput` types shall be exported from `@lousy-agents/lint`.
- The hand-authored `index.d.ts` shall include JSDoc documentation for `lintContent` with an example.
- The existing `runLint` API shall remain unchanged and fully functional.

**Verification**:
- [ ] `npm run build --workspace=packages/lint` succeeds
- [ ] `npx biome check packages/lint/src/index.ts` passes
- [ ] Existing `runLint` tests still pass: `npm test packages/lint/`
- [ ] New `lintContent` exports are importable from the built package

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Public API surface includes both `runLint` and `lintContent`
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 5: Add integration tests and update documentation

**Objective**: Add end-to-end integration tests that exercise the full `lintContent` flow and update `docs/lint.md`.

**Context**: Integration tests verify the entire pipeline works together. Documentation ensures consumers know the new API exists.

**Depends on**: Task 4

**Affected files**:
- `packages/lint/src/lint-content.integration.test.ts` (new)
- `docs/lint.md`

**Requirements**:
- Integration tests shall exercise `lintContent` for each target type (skill, agent, hook, instruction) with realistic content.
- Integration tests shall verify that invalid inputs produce `LintValidationError`.
- Integration tests shall verify multi-target calls return correct output structure.
- Documentation shall include a "String Input API" section with usage examples.
- Documentation shall document `LintContentOptions` and its sub-types.

**Verification**:
- [ ] `npm test packages/lint/src/lint-content.integration.test.ts` passes
- [ ] `mise run ci` passes (full validation suite)
- [ ] Documentation renders correctly in markdown preview

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] `mise run ci` exits 0
- [ ] Documentation accurately describes the new API
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

## Out of Scope

- Modifying the existing `runLint` directory-based API
- Adding a `rules` configuration parameter to `lintContent` (deferred)
- Browser-specific bundling or polyfills for the lint package
- Webapp scaffolding or UI for interactive linting
- Streaming or incremental linting of partial content
- Skill name-to-directory and agent name-to-filename matching validation in string mode

## Future Considerations

- Accept an optional `rules: LintRulesConfig` parameter in `lintContent` for custom severity overrides
- Add a browser-optimized bundle (ESM, tree-shakeable) of the lint package
- Support streaming content input for real-time linting as users type
- Add `--stdin` flag to the CLI that reads content from stdin and delegates to `lintContent`
- Consider a `lintContent` variant that accepts a single target for simpler single-file use cases
