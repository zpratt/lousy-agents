# Feature: Project Type Selection for Init Command

## Problem Statement

When developers initialize a new project using the `lousy-agents init` command, they need to specify the type of project they are scaffolding. Without this context, the tool cannot provide tailored instructions and configurations that match their project's architecture. This feature adds an interactive prompt to let users select their project type, enabling context-aware scaffolding.

## Personas

| Persona | Impact | Notes |
|---------|--------|-------|
| Software Engineer Learning Vibe Coding | Positive | Primary user - gets relevant scaffolding files for their specific project type |
| Team Lead | Positive | Can ensure consistent project setup across team members for different project types |

## Value Assessment

- **Primary value**: Efficiency — Reduces setup time by providing project-type-specific scaffolding, eliminating manual configuration
- **Secondary value**: Customer — Improves user experience by making the tool more intuitive and providing relevant guidance for each project type

## User Stories

### Story 1: Select Project Type During Initialization

As a **Software Engineer Learning Vibe Coding**,
I want **to select my project type from a menu when running `lousy-agents init`**,
so that I can **receive scaffolding files and instructions tailored to my specific project architecture**.

#### Acceptance Criteria

- When the user runs `lousy-agents init`, the CLI shall display a prompt asking "What type of project are you initializing?"
- The CLI shall present four options: "CLI", "webapp", "REST API", and "GraphQL API"
- When the user selects an option, the CLI shall accept the selection
- When the user selects "CLI", the CLI shall create a `.github/instructions` directory if it does not exist
- When the user selects "CLI", the CLI shall create a `.github/copilot-instructions.md` file if it does not exist
- The CLI shall preserve existing files and directories without modification

#### Notes

- Initial implementation focuses on "CLI" project type; other types will be implemented in future iterations
- The `.github/copilot-instructions.md` file should contain appropriate starter content for CLI projects
- The `.github/instructions` directory will be populated with instruction files in future iterations

---

## Design

> Refer to `.github/copilot-instructions.md` for technical standards.

### Components Affected

- `src/commands/init.ts` — Add project type prompt using consola, add directory and file creation logic
- `src/commands/init.test.ts` — Add tests for prompt interaction and file system operations

### Dependencies

- `consola` (already available via citty) — For interactive prompts using `prompt` method with `type: "select"`
- Node.js `fs/promises` — For file system operations (mkdir, writeFile, access)

### Data Model Changes

None - this feature does not persist state beyond file system operations.

### Open Questions

- [x] What content should be placed in `.github/copilot-instructions.md` for CLI projects? — Use project template appropriate for CLI projects
- [ ] Should other project types (webapp, REST API, GraphQL API) be implemented in this iteration? — No, focus on CLI first; others are future work

---

## Tasks

> Each task should be completable in a single coding agent session.
> Tasks are sequenced by dependency. Complete in order unless noted.

### Task 1: Add project type prompt to init command

**Objective**: Add interactive prompt that displays project type options and captures user selection

**Context**: This establishes the user interaction flow and is the foundation for conditional scaffolding logic

**Affected files**:
- `src/commands/init.ts`
- `src/commands/init.test.ts`

**Requirements**:
- When the user runs `lousy-agents init`, the CLI shall display a prompt asking "What type of project are you initializing?"
- The CLI shall present four options: "CLI", "webapp", "REST API", and "GraphQL API"
- When the user selects an option, the CLI shall accept the selection

**Verification**:
- [ ] `npm test src/commands/init.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Test validates prompt displays with correct message
- [ ] Test validates all four options are presented
- [ ] Test validates user selection is captured

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Acceptance criteria for prompt display and option selection satisfied
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 2: Implement directory and file creation for CLI project type

**Depends on**: Task 1

**Objective**: Create `.github/instructions` directory and `.github/copilot-instructions.md` file when "CLI" is selected

**Context**: This delivers the core scaffolding functionality for CLI projects, creating necessary directories and files

**Affected files**:
- `src/commands/init.ts`
- `src/commands/init.test.ts`

**Requirements**:
- When the user selects "CLI", the CLI shall create a `.github/instructions` directory if it does not exist
- When the user selects "CLI", the CLI shall create a `.github/copilot-instructions.md` file if it does not exist
- The CLI shall preserve existing files and directories without modification

**Verification**:
- [ ] `npm test src/commands/init.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Test validates `.github/instructions` directory is created when it doesn't exist
- [ ] Test validates `.github/copilot-instructions.md` file is created when it doesn't exist
- [ ] Test validates existing files and directories are not modified
- [ ] Manual test: Run `npm link && lousy-agents init`, select "CLI", verify files are created

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Acceptance criteria for directory and file creation satisfied
- [ ] Code follows patterns in `.github/copilot-instructions.md`
- [ ] Manual verification confirms expected behavior

---

### Task 3: Create declarative filesystem structure definition

**Depends on**: Task 2

**Objective**: Separate filesystem structure definition from the implementation that creates it

**Context**: As more directories and files will be added to the skeleton created by `init`, we need a declarative way to define the desired filesystem structure. This allows for easier maintenance and extension without modifying the core scaffolding logic.

**Affected files**:
- `src/lib/filesystem-structure.ts` (new) — Define types and structure for declarative filesystem definitions
- `src/commands/init.ts` — Refactor to use declarative structure
- `src/commands/init.test.ts` — Update tests to work with new structure

**Requirements**:
- The system shall support declaratively defining a filesystem tree structure
- The system shall support defining both directories and files within the tree
- The system shall support defining file content (initially empty for CLI project type)
- The structure definition shall be separate from the code that creates it
- The implementation shall remain simple and focused on the current scope (CLI project type)

**Verification**:
- [ ] `npm test src/commands/init.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Test validates declarative structure is used correctly
- [ ] Manual test: Run `npm link && lousy-agents init`, select "CLI", verify files are created

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Filesystem structure is defined declaratively
- [ ] Code follows patterns in `.github/copilot-instructions.md`
- [ ] Manual verification confirms expected behavior

---

## Out of Scope

- Implementation of scaffolding for "webapp", "REST API", and "GraphQL API" project types (future work)
- Populating `.github/instructions` directory with instruction files (future work)
- Customizing `.github/copilot-instructions.md` content based on project type beyond basic CLI template (future work)
- Configuration persistence of project type selection (future work)

## Future Considerations

- Add scaffolding logic for other project types (webapp, REST API, GraphQL API)
- Populate `.github/instructions` directory with relevant instruction files
- Create project-type-specific templates for `.github/copilot-instructions.md`
- Add option to customize scaffolding through configuration file
- Support for custom project types through plugins or extensions
