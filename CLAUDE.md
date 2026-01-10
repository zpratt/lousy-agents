# Project Instructions

Lousy Agents is a scaffolding tool that helps software engineers improve their workflow when leveraging AI agents. It provides patterns, instructions, and feedback loops for AI coding assistants.

See [.github/context/project.context.md](.github/context/project.context.md) for full project context.

---

## Testing Conventions

When writing or modifying test files (`*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx`):

### Mandatory

Run `npm test` after modifying or creating tests to verify all tests pass.

### Test File Structure

```typescript
import { describe, it, expect } from 'vitest';

describe('ComponentName', () => {
  describe('when [condition]', () => {
    it('should [expected behavior]', () => {
      // Arrange
      const input = 'test-value';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected-value');
    });
  });
});
```

### Test Data

- Use Chance.js to generate random test data when actual input values are not important
- Generate Chance.js data that produces readable assertion failure messages
- Use simple strings or numbers—avoid overly complex Chance.js configurations

### Test Design Rules

1. Follow the Arrange-Act-Assert (AAA) pattern for ALL tests
2. Use spec-style tests with `describe` and `it` blocks
3. Write test descriptions as user stories: "should [do something] when [condition]"
4. Focus on behavior, NOT implementation details
5. Extract fixture values to variables—NEVER hardcode values in both setup and assertions
6. Use `msw` to mock HTTP APIs—do NOT mock fetch or axios directly
7. Avoid mocking third-party dependencies when possible
8. Tests MUST be isolated—no shared state between tests
9. Tests MUST be deterministic—same result every run
10. Tests MUST run identically locally and in CI
11. NEVER use partial mocks
12. Test ALL conditional paths with meaningful assertions
13. Test unhappy paths and edge cases, not just happy paths
14. Every assertion should explain the expected behavior
15. Write tests that would FAIL if production code regressed
16. **NEVER export functions, methods, or variables from production code solely for testing purposes**
17. **NEVER use module-level mutable state for dependency injection in production code**

### Dependency Injection for Testing

When you need to inject dependencies for testing:

- **DO** use constructor parameters, function parameters, or framework-provided mechanisms (e.g., context objects)
- **DO** pass test doubles through the existing public API of the code under test
- **DO NOT** export special test-only functions like `_setTestDependencies()` or `_resetTestDependencies()`
- **DO NOT** modify module-level state from tests

#### Good Example (Dependency Injection via Parameters)

```typescript
// Production code
export const initCommand = defineCommand({
  run: async (context: CommandContext) => {
    const prompt = context.data?.prompt || consola.prompt;
    const result = await prompt("What is your name?");
    // ... use result
  },
});

// Test code
it("should prompt the user", async () => {
  const mockPrompt = vi.fn().mockResolvedValue("John");

  await initCommand.run({
    rawArgs: [],
    args: { _: [] },
    cmd: initCommand,
    data: { prompt: mockPrompt },
  });

  expect(mockPrompt).toHaveBeenCalledWith("What is your name?");
});
```

#### Bad Example (Test-Only Exports)

```typescript
// BAD: Production code
let _promptOverride: any;

export function _setTestDependencies(deps: any) {
  _promptOverride = deps.prompt;
}

export const initCommand = defineCommand({
  run: async () => {
    const prompt = _promptOverride || consola.prompt;
    // ...
  },
});

// BAD: Test code
import { _setTestDependencies, initCommand } from "./init.js";

beforeEach(() => {
  _setTestDependencies({ prompt: mockPrompt });
});
```

### Test Dependencies

Install new test dependencies using: `npm install <package>@<exact-version>`

---

## Spec Development

When working with spec files (`*.spec.md`):

### Role

Act as a collaborative PM pair, not a passive assistant:

- **Challenge assumptions**—Ask "why" before writing. Probe for the underlying problem
- **Identify gaps**—Flag missing acceptance criteria, edge cases, and error states
- **Guard scope**—Call out when a feature is too large for a single increment. Suggest phasing
- **Propose value**—Don't wait to be asked. Assess and state which value types a feature delivers
- **Ensure persona coverage**—Every spec must identify impacted personas. Push back if missing

### Before Writing or Modifying a Spec

1. Confirm you understand the problem being solved, not just the solution requested
2. Ask clarifying questions if the request is ambiguous
3. Identify which personas are affected and how
4. Propose a value assessment
5. Suggest scope boundaries if the feature feels too broad

### When Reviewing a Spec

1. Verify all acceptance criteria use EARS notation
2. Check that personas are explicitly named with impact described
3. Confirm design aligns with engineering guidance
4. Identify any missing error states or edge cases
5. Assess whether tasks are appropriately sized for the coding agent

### EARS Requirement Syntax

All acceptance criteria must use EARS (Easy Approach to Requirements Syntax) patterns:

| Pattern | Template | Use When |
|---------|----------|----------|
| Ubiquitous | The `<system>` shall `<response>` | Always true, no trigger |
| Event-driven | When `<trigger>`, the `<system>` shall `<response>` | Responding to an event |
| State-driven | While `<state>`, the `<system>` shall `<response>` | Active during a condition |
| Optional | Where `<feature>` is enabled, the `<system>` shall `<response>` | Configurable capability |
| Unwanted | If `<condition>`, then the `<system>` shall `<response>` | Error handling, edge cases |
| Complex | While `<state>`, when `<trigger>`, the `<system>` shall `<response>` | Combining conditions |

#### EARS Examples

- The workflow engine shall execute jobs in dependency order.
- When a workflow run completes, the system shall send a notification to subscribed channels.
- While a runner is offline, the system shall queue jobs for that runner.
- Where manual approval is configured, the system shall pause deployment until approved.
- If the workflow file contains invalid YAML, then the system shall display a validation error with line number.
- While branch protection is enabled, when a push is attempted to a protected branch, the system shall reject the push and return an error message.

### User Story Format

```markdown
### Story: <Concise Title>

As a **<persona>**,
I want **<capability>**,
so that I can **<outcome/problem solved>**.

#### Acceptance Criteria

- When <trigger>, the <system> shall <response>
- While <state>, the <system> shall <response>
- If <error condition>, then the <system> shall <response>

#### Notes

<Context, constraints, or open questions>
```

### Value Assessment

Evaluate every feature against these value types:

| Value Type | Question to Ask |
|------------|-----------------|
| Commercial | Does this increase revenue or reduce cost of sale? |
| Future | Does this save time or money later? Does it reduce technical debt? |
| Customer | Does this increase retention or satisfaction for existing users? |
| Market | Does this attract new users or open new segments? |
| Efficiency | Does this save operational time or reduce manual effort now? |

State the value assessment explicitly in the spec. If value is unclear, flag it as a risk.

### Spec File Structure

```markdown
# Feature: <name>

## Problem Statement

<2-3 sentences describing the problem, not the solution>

## Personas

| Persona | Impact | Notes |
|---------|--------|-------|
| <name> | Positive/Negative/Neutral | <brief explanation> |

## Value Assessment

- **Primary value**: <type> — <explanation>
- **Secondary value**: <type> — <explanation>

## User Stories

### Story 1: <Title>

As a **<persona>**,
I want **<capability>**,
so that I can **<outcome>**.

#### Acceptance Criteria

- When...
- While...
- If..., then...

---

## Design

### Components Affected

- `<path/to/file-or-directory>` — <what changes>

### Dependencies

- <External service, library, or internal component>

### Data Model Changes

<If applicable: new fields, schemas, or state changes>

### Open Questions

- [ ] <Unresolved technical or product question>

---

## Tasks

> Each task should be completable in a single coding agent session.
> Tasks are sequenced by dependency. Complete in order unless noted.

### Task 1: <Title>

**Objective**: <One sentence describing what this task accomplishes>

**Context**: <Why this task exists, what it unblocks>

**Affected files**:
- `<path/to/file>`

**Requirements**:
- <Specific acceptance criterion this task satisfies>

**Verification**:
- [ ] <Command to run or condition to check>
- [ ] <Test that should pass>

**Done when**:
- [ ] All verification steps pass
- [ ] No new errors in affected files
- [ ] Acceptance criteria satisfied

---

## Out of Scope

- <Explicitly excluded item>

## Future Considerations

- <Potential follow-on work>
```

### Task Design Guidelines

#### Size

- Completable in one agent session (~1-3 files, ~200-300 lines changed)
- If a task feels too large, split it
- If you have more than 7-10 tasks, split the feature into phases

#### Clarity

- **Objective**—One sentence, action-oriented ("Add validation to...", "Create endpoint for...")
- **Context**—Explains why; agents make better decisions with intent
- **Affected files**—Tells the agent where to focus
- **Requirements**—Links back to specific acceptance criteria

#### Verification

Every task must include verification steps:

- `npm test` passes
- `npm run lint` passes
- Specific behavior checks

Prefer automated checks (commands, tests) over subjective criteria.

### Anti-Patterns for Coding Agents

**Don't:**
- Create files outside the Affected files list without explicit approval
- Skip verification steps or mark tasks complete without running them
- Implement features not specified in acceptance criteria
- Assume dependencies are installed—verify or install as part of the task
- Batch multiple unrelated changes in a single task implementation
- Ignore error states or edge cases mentioned in acceptance criteria

**Do:**
- Read the full spec (Requirements, Design, and specific Task) before starting
- Follow verification steps in the exact order specified
- Ask for clarification when acceptance criteria are ambiguous
- Stay within the scope of the specific task assigned
- Update only the files listed in "Affected files" unless creating new test files
- Run all verification commands and report results

### Constraints

- **Avoid vague appeals to "best practices"**—Be specific about what you recommend and why

---

## CI/CD Pipelines

When modifying GitHub workflows (`.github/workflows/*.yml`, `.github/workflows/*.yaml`):

### Mandatory

Run these validation commands after modifying workflows:

```bash
mise lint
```

### Workflow Structure Requirements

1. Every workflow MUST include test and lint jobs
2. Use official setup actions: `actions/checkout`, `actions/setup-node`, `actions/cache`
3. Prefer using `mise` for installing tools and dependencies and scripts for verification

### Action Pinning Format

Pin ALL third-party actions to exact commit SHA with version comment:

```yaml
# CORRECT format:
uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1

# INCORRECT formats (do NOT use):
uses: actions/checkout@v4        # version tag only
uses: actions/checkout@v4.1.1    # version tag only
uses: actions/checkout@main      # branch reference
```

Before adding any action:
1. Check GitHub for the LATEST stable version
2. Find the full commit SHA for that version
3. Add both SHA and version comment

### Runner Requirements

| Workflow | Runner |
|----------|--------|
| Default (all workflows) | `ubuntu-latest` |
| `copilot-setup-steps.yml` | May use different runners as needed |
