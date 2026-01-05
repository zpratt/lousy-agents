# Feature: CLI Options for Init Command

## Problem Statement

Currently, the `lousy-agents init` command requires interactive user input to select the project type. This creates friction for users who want to automate project scaffolding in scripts or CI/CD pipelines, or who simply want a faster experience by providing all necessary information upfront. Adding CLI options allows users to supply all configuration through command-line arguments, enabling both interactive and non-interactive workflows.

## Personas

| Persona | Impact | Notes |
|---------|--------|-------|
| Software Engineer Learning Vibe Coding | Positive | Can scaffold projects faster by providing options directly, reducing setup time |
| Platform Engineer | Positive | Can automate project creation in scripts and CI/CD pipelines without interactive prompts |
| Team Lead | Positive | Can standardize project creation commands in documentation and onboarding materials |

## Value Assessment

- **Primary value**: Efficiency — Reduces scaffolding time by eliminating interactive prompts when all options are known upfront
- **Secondary value**: Customer — Improves user experience by supporting both interactive and non-interactive workflows, meeting different use cases

## User Stories

### Story 1: Specify Project Type via CLI Option

As a **Software Engineer Learning Vibe Coding**,
I want **to specify the project type using a `--kind` flag**,
so that I can **scaffold a new project with a single command without interactive prompts**.

#### Acceptance Criteria

- When the user runs `lousy-agents init --kind webapp`, the CLI shall create webapp scaffolding without prompting
- When the user runs `lousy-agents init --kind CLI`, the CLI shall create CLI scaffolding without prompting
- When the user runs `lousy-agents init` without the `--kind` option, the CLI shall display the interactive prompt as before
- If the user provides an invalid value for `--kind`, then the CLI shall display an error message listing valid options
- The CLI shall produce identical output whether the project type is provided via CLI option or interactive prompt
- The CLI shall support `--help` to display available options and their descriptions

#### Notes

- The `--kind` option accepts the same values as the interactive prompt: "CLI", "webapp", "REST API", "GraphQL API"
- This feature maintains backward compatibility with the existing interactive flow
- The option name `--kind` was chosen to be concise and descriptive of the project type selection

---

## Design

> Refer to `.github/copilot-instructions.md` for technical standards.

### Components Affected

- `src/commands/init.ts` — Add `args` configuration to defineCommand, update run function to use args when provided
- `src/commands/init.test.ts` — Add tests for CLI argument handling

### Dependencies

- `citty` (already available) — Provides `args` configuration for command-line argument parsing
- `zod` (already available) — For validation of CLI arguments

### Data Model Changes

None - this feature adds a new input method but does not change data models or persistence.

### Open Questions

- [x] Should we use `--kind` or `--type` for the option name? — Use `--kind` as it's more concise and avoids potential confusion with TypeScript
- [x] Should the option be required or optional? — Optional, maintaining backward compatibility with interactive mode
- [x] Should we support shorthand flags like `-k`? — Not in initial implementation to keep it simple

---

## Tasks

> Each task should be completable in a single coding agent session.
> Tasks are sequenced by dependency. Complete in order unless noted.

### Task 1: Add spec document to repository

**Objective**: Create spec document describing the CLI options feature

**Context**: This spec document guides implementation and serves as documentation for the feature

**Affected files**:
- `.github/specs/init-cli-options.spec.md` (new)

**Requirements**:
- Spec document shall follow EARS format for acceptance criteria
- Spec document shall identify affected personas and value assessment
- Spec document shall include implementation tasks with verification steps

**Verification**:
- [ ] Spec document exists in `.github/specs/` directory
- [ ] All acceptance criteria use EARS notation
- [ ] Personas and value assessment are documented

**Done when**:
- [ ] All verification steps pass
- [ ] Spec follows format defined in `.github/instructions/spec.instructions.md`

---

### Task 2: Add --kind argument to init command

**Depends on**: Task 1

**Objective**: Add `--kind` argument configuration to the init command using citty's args system

**Context**: This enables users to provide project type via CLI argument, which will be validated and used instead of prompting

**Affected files**:
- `src/commands/init.ts`

**Requirements**:
- The CLI shall accept a `--kind` option with string value
- The CLI shall validate that `--kind` value is one of: "CLI", "webapp", "REST API", "GraphQL API"
- If the user provides an invalid value for `--kind`, then the CLI shall display an error message listing valid options

**Verification**:
- [ ] `npm run build` succeeds
- [ ] `mise run format-check` passes
- [ ] Code follows patterns in `.github/copilot-instructions.md`

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Argument configuration is added to init command
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 3: Update init command to use CLI argument when provided

**Depends on**: Task 2

**Objective**: Modify the init command run function to skip interactive prompt when `--kind` is provided

**Context**: This implements the core logic that uses CLI argument when provided, falling back to interactive prompt

**Affected files**:
- `src/commands/init.ts`

**Requirements**:
- When the user runs `lousy-agents init --kind webapp`, the CLI shall create webapp scaffolding without prompting
- When the user runs `lousy-agents init --kind CLI`, the CLI shall create CLI scaffolding without prompting
- When the user runs `lousy-agents init` without the `--kind` option, the CLI shall display the interactive prompt as before
- The CLI shall produce identical output whether the project type is provided via CLI option or interactive prompt

**Verification**:
- [ ] `npm run build` succeeds
- [ ] `mise run format-check` passes
- [ ] Code follows patterns in `.github/copilot-instructions.md`

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Command uses CLI argument when provided
- [ ] Command falls back to interactive prompt when argument not provided
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 4: Add tests for CLI argument handling

**Depends on**: Task 3

**Objective**: Create tests verifying that CLI arguments work correctly and maintain backward compatibility

**Context**: Tests ensure the feature works correctly and prevents regressions in both new and existing functionality

**Affected files**:
- `src/commands/init.test.ts`

**Requirements**:
- When the user runs `lousy-agents init --kind webapp`, the CLI shall create webapp scaffolding without prompting
- When the user runs `lousy-agents init --kind CLI`, the CLI shall create CLI scaffolding without prompting
- When the user runs `lousy-agents init` without the `--kind` option, the CLI shall display the interactive prompt as before
- If the user provides an invalid value for `--kind`, then the CLI shall display an error message listing valid options
- The CLI shall produce identical output whether the project type is provided via CLI option or interactive prompt

**Verification**:
- [ ] `npm test` passes
- [ ] `mise run format-check` passes
- [ ] Tests follow patterns in `.github/instructions/test.instructions.md`
- [ ] All new code paths have test coverage

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Tests cover CLI argument scenarios
- [ ] Tests verify backward compatibility
- [ ] Tests follow patterns in `.github/instructions/test.instructions.md`

---

### Task 5: Manual testing and validation

**Depends on**: Task 4

**Objective**: Manually verify the feature works as expected in real usage

**Context**: Manual testing catches issues that automated tests might miss and validates user experience

**Affected files**:
- None (testing only)

**Requirements**:
- The CLI shall support `--help` to display available options and their descriptions
- When the user runs `lousy-agents init --kind webapp`, the CLI shall create webapp scaffolding without prompting
- When the user runs `lousy-agents init --kind CLI`, the CLI shall create CLI scaffolding without prompting

**Verification**:
- [ ] `npm run build` succeeds
- [ ] `node dist/index.js init --help` displays option information
- [ ] `node dist/index.js init --kind CLI` creates CLI scaffolding without prompts
- [ ] `node dist/index.js init --kind webapp` creates webapp scaffolding without prompts
- [ ] `node dist/index.js init --kind invalid` displays error with valid options
- [ ] `node dist/index.js init` displays interactive prompt as before
- [ ] `mise run ci && npm run build` passes

**Done when**:
- [ ] All verification steps pass
- [ ] Feature works correctly in manual testing
- [ ] All acceptance criteria satisfied
- [ ] Full validation suite passes

---

## Out of Scope

- Adding multiple CLI options (e.g., `--directory`, `--config-file`) - future enhancement
- Adding shorthand flags (e.g., `-k` for `--kind`) - future enhancement
- Supporting custom project types via CLI - requires broader feature work
- Interactive confirmation when using CLI arguments - not needed for automation use case

## Future Considerations

- Add `--directory` option to specify target directory
- Add `--config` option to specify custom configuration file
- Add shorthand flags for common options
- Add `--yes` flag to auto-confirm all prompts
- Support for reading options from environment variables
