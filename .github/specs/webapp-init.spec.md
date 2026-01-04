# Feature: Webapp Scaffolding for Init Command

## Problem Statement

Software engineers learning vibe coding need a way to quickly scaffold a new webapp project with Next.js, React, TypeScript, and proper testing setup. Without pre-configured scaffolding, developers must manually create configuration files, set up testing infrastructure, and configure build tools, which is time-consuming and error-prone. This feature enables developers to scaffold a complete webapp project structure by selecting "webapp" from the init command's project type menu.

## Personas

| Persona | Impact | Notes |
|---------|--------|-------|
| Software Engineer Learning Vibe Coding | Positive | Primary user - gets a fully-configured Next.js webapp with testing and linting setup |
| Team Lead | Positive | Can ensure consistent webapp project setup across team members |
| Frontend Developer | Positive | Receives a complete React/Next.js development environment ready to use |

## Value Assessment

- **Primary value**: Efficiency — Eliminates hours of manual configuration by providing a complete webapp project structure with testing, linting, and build tools pre-configured
- **Secondary value**: Customer — Improves user experience by reducing friction in starting new webapp projects and providing production-ready tooling from day one

## User Stories

### Story 1: Scaffold Webapp Project Files

As a **Software Engineer Learning Vibe Coding**,
I want **to select "webapp" from the init command and have all necessary webapp configuration files created**,
so that I can **immediately start building features without spending time on project setup**.

#### Acceptance Criteria

- When the user selects "webapp" from the init prompt, the system shall create a `package.json` file with Next.js, React, TypeScript, and testing dependencies if it does not exist
- When the user selects "webapp", the system shall create a `tsconfig.json` file with Next.js-appropriate TypeScript configuration if it does not exist
- When the user selects "webapp", the system shall create a `next.config.ts` file with recommended Next.js settings if it does not exist
- When the user selects "webapp", the system shall create a `vitest.config.ts` file with React testing configuration if it does not exist
- When the user selects "webapp", the system shall create a `vitest.setup.ts` file with testing library setup if it does not exist
- When the user selects "webapp", the system shall create a `biome.json` file with linting and formatting rules if it does not exist
- When the user selects "webapp", the system shall create a `.editorconfig` file with consistent editor settings if it does not exist
- When the user selects "webapp", the system shall create a `.nvmrc` file specifying the Node.js version if it does not exist
- The system shall preserve existing files without modification
- When existing files are encountered, the system shall skip them and continue scaffolding remaining files

#### Notes

- The webapp scaffolding is based on the reference implementation in `ui/copilot-with-react`
- All configuration files should contain working, production-ready settings
- Dependencies should use exact versions (no ^ or ~)

### Story 2: Scaffold Webapp Instructions and Guidelines

As a **Software Engineer Learning Vibe Coding**,
I want **the webapp scaffolding to include GitHub Copilot instructions tailored for webapp development**,
so that I can **receive appropriate AI assistance for my webapp project**.

#### Acceptance Criteria

- When the user selects "webapp", the system shall create a `.github/copilot-instructions.md` file with webapp-specific instructions if it does not exist
- When the user selects "webapp", the system shall create a `.github/instructions` directory if it does not exist
- When the user selects "webapp", the system shall create a `.github/instructions/test.instructions.md` file with webapp testing guidelines if it does not exist
- When the user selects "webapp", the system shall create a `.github/instructions/spec.instructions.md` file with spec development guidelines if it does not exist
- When the user selects "webapp", the system shall create a `.github/instructions/pipeline.instructions.md` file with CI/CD guidelines if it does not exist
- The system shall preserve existing instruction files without modification

#### Notes

- Instruction files should be copied from `ui/copilot-with-react/.github` directory
- Content should be appropriate for Next.js/React webapp development

### Story 3: Scaffold Additional Webapp Configuration

As a **Software Engineer Learning Vibe Coding**,
I want **additional configuration files for code quality and development environment**,
so that I can **have a consistent and well-configured development experience**.

#### Acceptance Criteria

- When the user selects "webapp", the system shall create a `.yamllint` file with YAML linting rules if it does not exist
- When the user selects "webapp", the system shall create a `.vscode/extensions.json` file with recommended VSCode extensions if it does not exist
- When the user selects "webapp", the system shall create a `.vscode/launch.json` file with debugging configuration if it does not exist
- When the user selects "webapp", the system shall create a `.devcontainer/devcontainer.json` file with development container configuration if it does not exist
- The system shall preserve existing configuration files without modification

#### Notes

- These files improve the development experience but are optional
- Configuration should match what's in `ui/copilot-with-react`

---

## Design

> Refer to `.github/copilot-instructions.md` for technical standards.

### Components Affected

- `src/lib/config.ts` — Add webapp structure configuration with all required files and their content
- `src/commands/init.ts` — Update to call webapp scaffolding when webapp is selected
- `src/commands/init.test.ts` — Add tests for webapp scaffolding
- `ui/copilot-with-react/` — Source directory for webapp template files

### Dependencies

- Node.js `fs/promises` (already in use) — For reading template files
- `c12` (already in use) — For configuration management
- `consola` (already in use) — For logging and user feedback

### Data Model Changes

**FilesystemNode enhancement:**

The current `FilesystemNode` types need no changes as they already support file content. However, we need to consider how to handle file content for webapp scaffolding:

1. **Inline content** - For small files, embed content directly in config
2. **Template reading** - For larger files, read from `ui/copilot-with-react` at runtime

For the first iteration, we'll use inline content for all files to keep the implementation simple and avoid runtime template reading complexity.

### Open Questions

- [x] Should we read template files from `ui/copilot-with-react` at runtime or embed them in config? — Use inline content in config for simplicity
- [x] How do we handle package.json merging with existing projects? — Skip if exists (preserve existing); future iteration can add smart merging
- [ ] Should we create a `src/` directory structure with example components? — Out of scope for first iteration; focus on configuration files only

---

## Tasks

> Each task should be completable in a single coding agent session.
> Tasks are sequenced by dependency. Complete in order unless noted.

### Task 1: Add webapp configuration structure

**Objective**: Define the complete webapp filesystem structure with all configuration file content in config.ts

**Context**: This establishes the declarative structure for webapp scaffolding. All file contents will be embedded inline for simplicity. This is the foundation for webapp scaffolding.

**Affected files**:
- `src/lib/config.ts`

**Requirements**:
- The system shall define a webapp structure containing all required configuration files
- The webapp structure shall include package.json, tsconfig.json, next.config.ts, vitest.config.ts, vitest.setup.ts, biome.json, .editorconfig, .nvmrc
- The webapp structure shall include .github/copilot-instructions.md with webapp-specific content
- The webapp structure shall include .github/instructions directory with test.instructions.md, spec.instructions.md, and pipeline.instructions.md
- The webapp structure shall include .yamllint configuration
- The webapp structure shall include .vscode/extensions.json and .vscode/launch.json
- The webapp structure shall include .devcontainer/devcontainer.json
- All file contents shall match the reference files in ui/copilot-with-react

**Verification**:
- [ ] `npm test src/lib/config.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Tests validate webapp structure is defined
- [ ] Tests validate webapp structure contains expected files

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Webapp structure is defined with all configuration files
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 2: Update config tests for webapp structure

**Depends on**: Task 1

**Objective**: Add tests to verify webapp structure is properly defined and contains expected files

**Context**: Ensures the webapp configuration is correct and follows the same testing patterns as CLI configuration

**Affected files**:
- `src/lib/config.test.ts`

**Requirements**:
- Tests shall verify webapp structure is defined in configuration
- Tests shall verify webapp structure contains key configuration files
- Tests shall verify getProjectStructure returns webapp structure for "webapp" project type

**Verification**:
- [ ] `npm test src/lib/config.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Tests validate webapp structure exists
- [ ] Tests validate key files are present in structure

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Webapp configuration is properly tested
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 3: Implement webapp scaffolding in init command

**Depends on**: Task 2

**Objective**: Add conditional logic to create webapp scaffolding when webapp project type is selected

**Context**: This connects the webapp structure to the init command, enabling users to scaffold webapp projects

**Affected files**:
- `src/commands/init.ts`

**Requirements**:
- When the user selects "webapp", the system shall load the webapp structure from configuration
- When the user selects "webapp", the system shall call createFilesystemStructure with the webapp structure
- When the user selects "webapp", the system shall log success messages for created files
- The system shall handle errors gracefully with descriptive error messages

**Verification**:
- [ ] `npm test src/commands/init.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] Code follows same pattern as CLI scaffolding

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Webapp scaffolding logic is implemented
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 4: Add webapp scaffolding tests

**Depends on**: Task 3

**Objective**: Add comprehensive tests for webapp scaffolding functionality

**Context**: Ensures webapp scaffolding works correctly, creates expected files, and preserves existing files

**Affected files**:
- `src/commands/init.test.ts`

**Requirements**:
- Tests shall verify webapp scaffolding creates expected files in empty directory
- Tests shall verify webapp scaffolding preserves existing files
- Tests shall verify webapp scaffolding creates .github/copilot-instructions.md
- Tests shall verify webapp scaffolding creates .github/instructions directory
- Tests shall verify webapp scaffolding creates configuration files
- Tests shall follow same testing patterns as CLI scaffolding tests

**Verification**:
- [ ] `npm test src/commands/init.test.ts` passes
- [ ] `mise run format-check` passes
- [ ] All webapp scaffolding scenarios are tested

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Webapp scaffolding is fully tested
- [ ] Code follows patterns in `.github/copilot-instructions.md`

---

### Task 5: Manual verification and validation

**Depends on**: Task 4

**Objective**: Manually test the webapp scaffolding end-to-end and run full validation suite

**Context**: Final verification to ensure the feature works as expected from a user perspective

**Affected files**:
- N/A (manual testing)

**Requirements**:
- Manual test shall verify `npm link && lousy-agents init` works
- Manual test shall verify selecting "webapp" creates all expected files
- Manual test shall verify content of created files matches reference
- Manual test shall verify running init in existing directory preserves files
- Full validation suite shall pass

**Verification**:
- [ ] `npm link` succeeds
- [ ] `lousy-agents init` runs without errors
- [ ] Selecting "webapp" creates expected files
- [ ] Created files have correct content
- [ ] Running init again preserves existing files
- [ ] `mise run ci && npm run build` passes

**Done when**:
- [ ] All manual verification steps pass
- [ ] Full validation suite passes
- [ ] Feature is ready for use
- [ ] No regressions in existing functionality

---

## Out of Scope

- Smart merging of package.json with existing dependencies (preserve existing files for now)
- Creating src/ directory structure with example React components (configuration only)
- Scaffolding of app/ or pages/ directories with example routes
- Git repository initialization or .gitignore creation
- README.md generation with project-specific content
- npm install or dependency installation (users run this manually)

## Future Considerations

- Add intelligent merging for package.json to combine dependencies
- Create example React components and page structure
- Add option to choose between pages router and app router
- Generate project-specific README.md
- Add option to initialize git repository
- Support customization of webapp scaffolding through configuration
- Add TypeScript path alias validation
- Create example tests for scaffolded components
