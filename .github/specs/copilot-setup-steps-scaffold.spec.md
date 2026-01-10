# Feature: Copilot Setup Steps Workflow Scaffold

## Problem Statement

When software engineers want to leverage GitHub Copilot Coding Agent effectively, they need a properly configured `copilot-setup-steps.yml` workflow in their repository. Without this workflow, the Copilot agent lacks the necessary environment configuration and feedback loop to produce reliable code. Manually creating and maintaining this workflow is time-consuming, error-prone, and requires knowledge of the repository's tooling setup (version managers, language runtimes, etc.). This feature automates the detection of environment configuration and generates or updates the Copilot Setup Steps workflow accordingly.

## Personas

| Persona | Impact | Notes |
|---------|--------|-------|
| Software Engineer Learning Vibe Coding | Positive | Primary user - gets automated workflow setup tailored to their project's environment |
| Platform Engineer | Positive | Can ensure consistent Copilot agent configuration across repositories |
| Team Lead | Positive | Can standardize Copilot workflow configuration in documentation and templates |

## Value Assessment

- **Primary value**: Efficiency — Eliminates manual workflow creation by automatically detecting environment configuration and generating appropriate setup steps
- **Secondary value**: Future — Reduces technical debt by ensuring Copilot workflows stay synchronized with project tooling as it evolves

## User Stories

### Story 1: Detect Environment Configuration Files

As a **Software Engineer Learning Vibe Coding**,
I want **the tool to detect environment configuration files in my repository**,
so that I can **automatically include appropriate setup steps in my Copilot workflow**.

#### Acceptance Criteria

- When the user runs the scaffold command, the system shall scan the repository root for `mise.toml` configuration files
- When the user runs the scaffold command, the system shall scan the repository root for idiomatic version files (`.nvmrc`, `.python-version`, `.java-version`, `.ruby-version`, `.go-version`)
- When `mise.toml` is detected, the system shall queue the `jdx/mise-action` step as a candidate for the Copilot Setup Steps workflow
- When `.nvmrc` is detected and `mise.toml` is not present, the system shall queue the `actions/setup-node` step as a candidate
- When `.python-version` is detected and `mise.toml` is not present, the system shall queue the `actions/setup-python` step as a candidate
- When `.java-version` is detected and `mise.toml` is not present, the system shall queue the `actions/setup-java` step as a candidate
- When `.ruby-version` is detected and `mise.toml` is not present, the system shall queue the `actions/setup-ruby` step as a candidate
- When `.go-version` is detected and `mise.toml` is not present, the system shall queue the `actions/setup-go` step as a candidate

#### Notes

- `mise.toml` takes precedence over individual version files since mise can manage multiple languages
- The idiomatic version file extensions may vary (e.g., `.node-version` as alternative to `.nvmrc`)
- Detection should be non-recursive (only check repository root)

### Story 2: Parse Existing Workflows for Setup Actions

As a **Software Engineer Learning Vibe Coding**,
I want **the tool to parse my existing workflow files for setup actions**,
so that I can **ensure my Copilot workflow has consistent environment configuration with my CI workflows**.

#### Acceptance Criteria

- When the user runs the scaffold command, the system shall parse all YAML files in `.github/workflows` directory
- When a workflow contains `actions/setup-node` usage, the system shall queue the corresponding setup step as a candidate
- When a workflow contains `actions/setup-python` usage, the system shall queue the corresponding setup step as a candidate
- When a workflow contains `actions/setup-java` usage, the system shall queue the corresponding setup step as a candidate
- When a workflow contains `actions/setup-go` usage, the system shall queue the corresponding setup step as a candidate
- When a workflow contains `actions/setup-ruby` usage, the system shall queue the corresponding setup step as a candidate
- When a workflow contains `jdx/mise-action` usage, the system shall queue the corresponding setup step as a candidate
- When extracting setup actions, the system shall capture the action version and configuration parameters
- The system shall deduplicate setup step candidates from version files and workflow parsing

#### Notes

- Action references may include version tags (e.g., `actions/setup-node@v4`) or commit SHAs
- Multiple workflows may use the same setup action; only one candidate should be added
- Configuration parameters (e.g., `node-version-file`, `python-version`) should be preserved

### Story 3: Create New Copilot Setup Steps Workflow

As a **Software Engineer Learning Vibe Coding**,
I want **the tool to create a new Copilot Setup Steps workflow when one doesn't exist**,
so that I can **quickly set up the required workflow for GitHub Copilot Coding Agent**.

#### Acceptance Criteria

- When the user runs the scaffold command and no `copilot-setup-steps.yml` exists in `.github/workflows`, the system shall create a new workflow file
- The created workflow shall include the `actions/checkout` step as the first step
- The created workflow shall include all detected setup step candidates in appropriate order
- The created workflow shall include standard workflow configuration (name, triggers, permissions)
- When the workflow is created, the system shall display a success message listing the added setup steps
- If no setup step candidates are detected, then the system shall create a minimal workflow with only checkout and display a warning

#### Notes

- The workflow should follow GitHub Actions best practices for Copilot setup
- Setup steps should be ordered logically (checkout first, then language setup)
- The workflow should include appropriate permissions for Copilot agent

### Story 4: Update Existing Copilot Setup Steps Workflow

As a **Software Engineer Learning Vibe Coding**,
I want **the tool to update my existing Copilot Setup Steps workflow with missing setup steps**,
so that I can **keep my workflow synchronized with my project's environment configuration**.

#### Acceptance Criteria

- When the user runs the scaffold command and `copilot-setup-steps.yml` exists in `.github/workflows`, the system shall parse the existing workflow
- When the existing workflow is missing detected setup step candidates, the system shall append the missing steps to the workflow
- When the existing workflow already contains a detected setup step, the system shall skip that step to avoid duplication
- When steps are appended to the workflow, the system shall display a success message listing the added steps
- If the existing workflow already contains all detected setup steps, then the system shall display a message indicating no changes are needed
- The system shall preserve existing workflow content and formatting where possible

#### Notes

- Care must be taken not to corrupt existing YAML structure
- Position of new steps should be after existing setup steps
- User should be informed of what changes were made

---

## Design

> Refer to `.github/copilot-instructions.md` for technical standards.

### Components Affected

- `src/commands/copilot-setup.ts` (new) — Main command implementation for Copilot Setup Steps scaffold
- `src/commands/copilot-setup.test.ts` (new) — Tests for the scaffold command
- `src/lib/environment-detector.ts` (new) — Module for detecting environment configuration files
- `src/lib/environment-detector.test.ts` (new) — Tests for environment detection
- `src/lib/workflow-parser.ts` (new) — Module for parsing GitHub Actions workflow files
- `src/lib/workflow-parser.test.ts` (new) — Tests for workflow parsing
- `src/lib/workflow-generator.ts` (new) — Module for generating/updating Copilot Setup Steps workflow
- `src/lib/workflow-generator.test.ts` (new) — Tests for workflow generation
- `src/index.ts` — Register new command with CLI

### Dependencies

- `yaml` (new) — For parsing and generating YAML workflow files
- `zod` (existing) — For runtime validation of workflow structure
- `consola` (existing) — For logging and user feedback
- Node.js `fs/promises` (existing) — For file system operations

### Data Model Changes

**SetupStepCandidate type:**

```typescript
interface SetupStepCandidate {
  action: string;           // e.g., "actions/setup-node"
  version?: string;         // e.g., "v4" or commit SHA
  config?: Record<string, string>;  // e.g., { "node-version-file": ".nvmrc" }
  source: "version-file" | "workflow";  // Where this candidate was detected
}
```

**DetectedEnvironment type:**

```typescript
interface DetectedEnvironment {
  hasMise: boolean;
  versionFiles: VersionFile[];
  workflowSetupActions: SetupStepCandidate[];
}

interface VersionFile {
  type: "node" | "python" | "java" | "ruby" | "go";
  filename: string;
  version?: string;  // Content of the version file
}
```

### Open Questions

- [ ] Should the command be a subcommand of `init` or a separate top-level command? — Suggest separate command `lousy-agents copilot-setup`
- [ ] Should the tool support dry-run mode to preview changes? — Consider for future enhancement
- [ ] How to handle conflicting versions between version files and workflow actions? — Prefer workflow action configuration if present

---

## Tasks

> Each task should be completable in a single coding agent session.
> Tasks are sequenced by dependency. Complete in order unless noted.

### Task 1: Create environment detection module

**Objective**: Create module to detect environment configuration files in repository root

**Context**: This establishes the foundation for detecting what setup steps are needed based on project configuration

**Affected files**:
- `src/lib/environment-detector.ts` (new)
- `src/lib/environment-detector.test.ts` (new)

**Requirements**:
- When called, the detector shall scan the repository root for `mise.toml`
- When called, the detector shall scan for idiomatic version files (`.nvmrc`, `.node-version`, `.python-version`, `.java-version`, `.ruby-version`, `.go-version`)
- The detector shall return a structured object containing detected files
- The detector shall read and return the content of version files

**Verification**:
- [ ] `npm test src/lib/environment-detector.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Tests cover detection of each supported version file type
- [ ] Tests cover case when no configuration files exist

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Environment detection works correctly
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 2: Create workflow parser module

**Depends on**: Task 1

**Objective**: Create module to parse GitHub Actions workflow files and extract setup action usage

**Context**: This enables detection of setup actions already in use in the repository's workflows

**Affected files**:
- `src/lib/workflow-parser.ts` (new)
- `src/lib/workflow-parser.test.ts` (new)

**Requirements**:
- When called, the parser shall read all YAML files from `.github/workflows` directory
- The parser shall identify setup actions (`actions/setup-*`, `jdx/mise-action`)
- The parser shall extract action version and configuration parameters
- If no workflows exist, then the parser shall return an empty list

**Verification**:
- [ ] `npm test src/lib/workflow-parser.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Tests cover parsing workflows with various setup actions
- [ ] Tests cover workflows with no setup actions
- [ ] Tests cover malformed YAML handling

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Workflow parsing extracts setup actions correctly
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 3: Create setup step candidate builder

**Depends on**: Task 1, Task 2

**Objective**: Create logic to build setup step candidates from environment detection and workflow parsing

**Context**: This combines detection results into a deduplicated list of setup step candidates

**Affected files**:
- `src/lib/workflow-generator.ts` (new)
- `src/lib/workflow-generator.test.ts` (new)

**Requirements**:
- The builder shall create candidates from detected version files
- The builder shall add candidates from parsed workflow setup actions
- The builder shall deduplicate candidates, preferring workflow-sourced configurations
- When `mise.toml` is detected, the builder shall prioritize mise-action over individual setup actions

**Verification**:
- [ ] `npm test src/lib/workflow-generator.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Tests verify candidate creation from version files
- [ ] Tests verify deduplication logic
- [ ] Tests verify mise.toml precedence

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Candidate building works correctly
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 4: Create workflow generation logic

**Depends on**: Task 3

**Objective**: Create logic to generate Copilot Setup Steps workflow YAML content

**Context**: This generates the complete workflow file from setup step candidates

**Affected files**:
- `src/lib/workflow-generator.ts` (extend)
- `src/lib/workflow-generator.test.ts` (extend)

**Requirements**:
- The generator shall create valid GitHub Actions workflow YAML
- The generator shall include checkout step as first step
- The generator shall include all setup step candidates in logical order
- The generator shall include appropriate workflow name, triggers, and permissions

**Verification**:
- [ ] `npm test src/lib/workflow-generator.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Tests verify generated YAML is valid
- [ ] Tests verify step ordering
- [ ] Tests verify standard workflow structure

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Workflow generation produces valid YAML
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 5: Create workflow update logic

**Depends on**: Task 4

**Objective**: Create logic to update existing Copilot Setup Steps workflow with missing steps

**Context**: This handles the case where a workflow already exists but needs additional setup steps

**Affected files**:
- `src/lib/workflow-generator.ts` (extend)
- `src/lib/workflow-generator.test.ts` (extend)

**Requirements**:
- When updating, the system shall parse existing workflow to identify current steps
- When updating, the system shall identify missing setup step candidates
- When updating, the system shall append missing steps after existing setup steps
- When updating, the system shall preserve existing workflow content
- If no steps are missing, then the system shall return the unchanged workflow

**Verification**:
- [ ] `npm test src/lib/workflow-generator.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Tests verify missing steps are appended
- [ ] Tests verify existing content is preserved
- [ ] Tests verify no changes when all steps present

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Workflow updating works correctly
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 6: Create copilot-setup command

**Depends on**: Task 5

**Objective**: Create the main CLI command that orchestrates environment detection, workflow parsing, and generation

**Context**: This ties all modules together into a user-facing command

**Affected files**:
- `src/commands/copilot-setup.ts` (new)
- `src/commands/copilot-setup.test.ts` (new)
- `src/index.ts` (update to register command)

**Requirements**:
- When run, the command shall detect environment configuration
- When run, the command shall parse existing workflows for setup actions
- When no copilot-setup-steps.yml exists, the command shall create a new workflow
- When copilot-setup-steps.yml exists, the command shall update with missing steps
- The command shall display appropriate success/warning messages

**Verification**:
- [ ] `npm test src/commands/copilot-setup.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Manual test: `node dist/index.js copilot-setup` creates workflow
- [ ] Manual test: Running again shows no changes needed

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Command orchestrates all modules correctly
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 7: Integration testing and validation

**Depends on**: Task 6

**Objective**: Perform end-to-end testing and run full validation suite

**Context**: Final verification to ensure the feature works correctly in real scenarios

**Affected files**:
- N/A (testing only)

**Requirements**:
- Manual test shall verify command works in repository with mise.toml
- Manual test shall verify command works in repository with only .nvmrc
- Manual test shall verify command updates existing workflow correctly
- Full validation suite shall pass

**Verification**:
- [ ] `npm link` succeeds
- [ ] `lousy-agents copilot-setup` runs without errors in test repositories
- [ ] Created workflows are valid GitHub Actions YAML
- [ ] `mise run ci && npm run build` passes

**Done when**:
- [ ] All verification steps pass
- [ ] Feature works correctly in manual testing
- [ ] No regressions in existing functionality

---

## Out of Scope

- Auto-detection of language-specific package managers (npm, pip, etc.) for dependency installation steps
- Interactive prompts to customize workflow generation
- Support for matrix builds or complex workflow configurations
- Validation that generated workflow actually runs successfully
- Integration with GitHub API to check existing workflow runs

## Future Considerations

- Add dry-run mode to preview changes before writing
- Support additional setup actions beyond language runtimes (e.g., Docker, caching)
- Add option to specify target workflow file name
- Support for monorepo configurations with multiple version files in subdirectories
- Integration with `lousy-agents init` to run copilot-setup automatically after scaffolding
- Add command-line options to force regeneration or skip specific detections
