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
- When the user runs the scaffold command, the system shall scan the repository root for idiomatic version files (`.nvmrc`, `.node-version`, `.python-version`, `.java-version`, `.ruby-version`, `.go-version`)
- When `mise.toml` is detected, the system shall queue the `jdx/mise-action` step as a candidate for the Copilot Setup Steps workflow
- When `.nvmrc` is detected and `mise.toml` is not present, the system shall queue the `actions/setup-node` step as a candidate
- When `.node-version` is detected and `mise.toml` is not present, the system shall queue the `actions/setup-node` step as a candidate
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

- The workflow should be named `Copilot Setup Steps` and stored at `.github/workflows/copilot-setup-steps.yml`
- The workflow should define `workflow_dispatch` and `pull_request` triggers so that Copilot runs both on demand and for pull request validation
- The workflow should request the minimum required permissions for Copilot agent execution, including `contents: read` and `id-token: write`
- Setup steps should be ordered logically (checkout first, then language/runtime setup and tooling installation)

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

**Commands Layer:**
- `src/commands/copilot-setup.ts` (new) — Main CLI command that orchestrates environment detection and workflow generation
- `src/commands/copilot-setup.test.ts` (new) — Tests for the scaffold command

**Entities Layer:**
- `src/entities/copilot-setup.ts` (new) — Core domain types (SetupStepCandidate, VersionFile, DetectedEnvironment)
- `src/entities/index.ts` (new) — Exports entity types

**Gateways Layer:**
- `src/gateways/environment-gateway.ts` (new) — Interface for detecting environment configuration files
- `src/gateways/workflow-gateway.ts` (new) — Interface for parsing/writing workflow files
- `src/gateways/file-system-workflow-gateway.ts` (new) — File system implementation of WorkflowGateway
- `src/gateways/action-version-gateway.ts` (new) — Interface for looking up action versions
- `src/gateways/action-version-gateway.test.ts` (new) — Tests for action version lookup
- `src/gateways/file-system-utils.ts` (new) — Shared file system utilities
- `src/gateways/index.ts` (new) — Exports gateway interfaces and implementations

**Use Cases Layer:**
- `src/use-cases/copilot-setup.ts` (new) — Business logic for candidate building, workflow generation/update
- `src/use-cases/copilot-setup.test.ts` (new) — Tests for use case logic
- `src/use-cases/setup-step-discovery.ts` (new) — Reusable step discovery logic
- `src/use-cases/setup-step-discovery.test.ts` (new) — Tests for step discovery
- `src/use-cases/index.ts` (new) — Exports use case functions

**Configuration:**
- `src/lib/copilot-setup-config.ts` (new) — c12 configuration for version files and setup actions
- `src/lib/copilot-setup-config.test.ts` (new) — Tests for configuration loading

**CLI Registration:**
- `src/index.ts` — Register new command with CLI

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLI Layer                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                        copilot-setup command                                 │    │
│  │                    (src/commands/copilot-setup.ts)                           │    │
│  │                                                                              │    │
│  │  Orchestrates: detection → parsing → merging → generation/update            │    │
│  └──────────────────────────────────┬──────────────────────────────────────────┘    │
└─────────────────────────────────────┼───────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                Use Cases Layer                                       │
│                                                                                      │
│  ┌────────────────────────────┐     ┌────────────────────────────────┐              │
│  │    copilot-setup.ts        │     │   setup-step-discovery.ts      │              │
│  │                            │     │                                │              │
│  │ • buildCandidatesFrom-     │     │ • parseActionName()            │              │
│  │   Environment()            │     │ • isSetupAction()              │              │
│  │ • generateWorkflowContent()│     │ • getExistingActionsFrom-      │              │
│  │ • updateWorkflowWith-      │◄────┤   Workflow()                   │              │
│  │   MissingSteps()           │     │ • findMissingCandidates()      │              │
│  │                            │     │ • mergeCandidates()            │              │
│  └─────────────┬──────────────┘     │ • deduplicateCandidates()      │              │
│                │                    └────────────────────────────────┘              │
└────────────────┼────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                Gateways Layer                                        │
│                                                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐       │
│  │  EnvironmentGateway  │  │   WorkflowGateway    │  │ ActionVersionGateway │       │
│  │                      │  │                      │  │                      │       │
│  │ • detectEnvironment()│  │ • parseWorkflowsFor- │  │ • getVersion()       │       │
│  │                      │  │   SetupActions()     │  │ • getCheckoutVersion │       │
│  │                      │  │ • copilotSetupWork-  │  │                      │       │
│  │                      │  │   flowExists()       │  │                      │       │
│  │                      │  │ • readCopilotSetup-  │  │                      │       │
│  │                      │  │   Workflow()         │  │                      │       │
│  │                      │  │ • writeCopilotSetup- │  │                      │       │
│  │                      │  │   Workflow()         │  │                      │       │
│  └──────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘       │
└─────────────┼──────────────────────────┼──────────────────────────┼──────────────────┘
              │                          │                          │
              ▼                          ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              External Resources                                      │
│                                                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐       │
│  │    File System       │  │   .github/workflows  │  │  Configuration       │       │
│  │                      │  │                      │  │  (c12)               │       │
│  │ • mise.toml          │  │ • *.yml workflow     │  │                      │       │
│  │ • .nvmrc             │  │   files              │  │ • lousy-agents.json  │       │
│  │ • .python-version    │  │ • copilot-setup-     │  │ • versionFiles       │       │
│  │ • .java-version      │  │   steps.yml          │  │ • setupActions       │       │
│  │ • .ruby-version      │  │                      │  │ • setupActionPatterns│       │
│  │ • .go-version        │  │                      │  │                      │       │
│  │ • .node-version      │  │                      │  │                      │       │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────────────┘

                              Data Flow Sequence
                              ==================

┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │     │  Command    │     │  Use Cases  │     │  Gateways   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │ copilot-setup     │                   │                   │
       │──────────────────>│                   │                   │
       │                   │                   │                   │
       │                   │ detectEnvironment()                   │
       │                   │───────────────────────────────────────>│
       │                   │                   │                   │
       │                   │          DetectedEnvironment          │
       │                   │<───────────────────────────────────────│
       │                   │                   │                   │
       │                   │ parseWorkflowsForSetupActions()       │
       │                   │───────────────────────────────────────>│
       │                   │                   │                   │
       │                   │       SetupStepCandidate[]            │
       │                   │<───────────────────────────────────────│
       │                   │                   │                   │
       │                   │ buildCandidatesFromEnvironment()      │
       │                   │──────────────────>│                   │
       │                   │                   │ getVersion()      │
       │                   │                   │──────────────────>│
       │                   │                   │<──────────────────│
       │                   │<──────────────────│                   │
       │                   │                   │                   │
       │                   │ mergeCandidates() │                   │
       │                   │──────────────────>│                   │
       │                   │<──────────────────│                   │
       │                   │                   │                   │
       │                   │ [if exists] readCopilotSetupWorkflow()│
       │                   │───────────────────────────────────────>│
       │                   │<───────────────────────────────────────│
       │                   │                   │                   │
       │                   │ generateWorkflowContent() or          │
       │                   │ updateWorkflowWithMissingSteps()      │
       │                   │──────────────────>│                   │
       │                   │<──────────────────│                   │
       │                   │                   │                   │
       │                   │ writeCopilotSetupWorkflow()           │
       │                   │───────────────────────────────────────>│
       │                   │<───────────────────────────────────────│
       │                   │                   │                   │
       │   Success message │                   │                   │
       │<──────────────────│                   │                   │
       │                   │                   │                   │
```

### Architecture Notes

The implementation follows CLEAN Architecture principles with clear separation of concerns:

1. **Entities Layer** (`src/entities/`): Core domain types (`SetupStepCandidate`, `VersionFile`, `DetectedEnvironment`) that are independent of any frameworks or external systems.

2. **Use Cases Layer** (`src/use-cases/`): Application business logic that orchestrates entities and gateways. Key modules:
   - `copilot-setup.ts`: Candidate building, workflow generation/update
   - `setup-step-discovery.ts`: Reusable step discovery logic

3. **Gateways Layer** (`src/gateways/`): Interfaces to external systems (file system, configuration). This abstraction enables:
   - Easy testing via mock gateways
   - Future remote API integration (e.g., `ActionVersionGateway` could fetch versions from GitHub)
   - Separation of I/O concerns from business logic

4. **Commands Layer** (`src/commands/`): CLI entry points that wire together use cases and gateways

**Key Architectural Decisions:**
- Configuration-driven: Setup actions and version files are defined in c12 configuration, not hardcoded
- Gateway pattern: All external I/O is abstracted behind interfaces for testability
- Step discovery is extracted to a separate module for reuse across different workflow types
- Async version lookup enables future GitHub API integration

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

- [x] Should the command be a subcommand of `init` or a separate top-level command? — Implemented as separate command `lousy-agents copilot-setup`
- [x] Should the tool support dry-run mode to preview changes? — Deferred for future enhancement
- [x] How to handle conflicting versions between version files and workflow actions? — Implemented: Workflow action configuration takes precedence

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
- [x] `npm test src/lib/environment-detector.test.ts` passes
- [x] `mise run format-check` passes
- [x] Tests cover detection of each supported version file type
- [x] Tests cover case when no configuration files exist

**Done when**:
- [x] All verification steps pass
- [x] No new errors in affected files
- [x] Environment detection works correctly
- [x] Code follows patterns in `.github/copilot-instructions.md`

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
- [x] `npm test src/lib/workflow-parser.test.ts` passes
- [x] `mise run format-check` passes
- [x] Tests cover parsing workflows with various setup actions
- [x] Tests cover workflows with no setup actions
- [x] Tests cover malformed YAML handling

**Done when**:
- [x] All verification steps pass
- [x] No new errors in affected files
- [x] Workflow parsing extracts setup actions correctly
- [x] Code follows patterns in `.github/copilot-instructions.md`

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
- [x] `npm test src/lib/workflow-generator.test.ts` passes
- [x] `mise run format-check` passes
- [x] Tests verify candidate creation from version files
- [x] Tests verify deduplication logic
- [x] Tests verify mise.toml precedence

**Done when**:
- [x] All verification steps pass
- [x] No new errors in affected files
- [x] Candidate building works correctly
- [x] Code follows patterns in `.github/copilot-instructions.md`

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
- [x] `npm test src/lib/workflow-generator.test.ts` passes
- [x] `mise run format-check` passes
- [x] Tests verify generated YAML is valid
- [x] Tests verify step ordering
- [x] Tests verify standard workflow structure

**Done when**:
- [x] All verification steps pass
- [x] No new errors in affected files
- [x] Workflow generation produces valid YAML
- [x] Code follows patterns in `.github/copilot-instructions.md`

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
- [x] `npm test src/lib/workflow-generator.test.ts` passes
- [x] `mise run format-check` passes
- [x] Tests verify missing steps are appended
- [x] Tests verify existing content is preserved
- [x] Tests verify no changes when all steps present

**Done when**:
- [x] All verification steps pass
- [x] No new errors in affected files
- [x] Workflow updating works correctly
- [x] Code follows patterns in `.github/copilot-instructions.md`

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
- [x] `npm test src/commands/copilot-setup.test.ts` passes
- [x] `mise run format-check` passes
- [x] Manual test: `node dist/index.js copilot-setup` creates workflow
- [x] Manual test: Running again shows no changes needed

**Done when**:
- [x] All verification steps pass
- [x] No new errors in affected files
- [x] Command orchestrates all modules correctly
- [x] Code follows patterns in `.github/copilot-instructions.md`

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
- [x] `npm link` succeeds
- [x] `lousy-agents copilot-setup` runs without errors in test repositories
- [x] Created workflows are valid GitHub Actions YAML
- [x] `mise run ci && npm run build` passes (note: check-jsonschema has network issues in sandboxed environment, all other checks pass)

**Done when**:
- [x] All verification steps pass
- [x] Feature works correctly in manual testing
- [x] No regressions in existing functionality

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
