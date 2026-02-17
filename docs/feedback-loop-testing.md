# Feedback Loop Discovery - End-to-End Testing

This document explains the end-to-end integration tests for the feedback loop discovery and validation features.

## Test File

`src/use-cases/feedback-loop-discovery.integration.test.ts`

## What It Tests

The integration test creates realistic project structures and validates:

1. **Script Discovery** - Discovers npm scripts from `package.json`
2. **Tool Discovery** - Discovers CLI commands from GitHub Actions workflows
3. **SDLC Phase Mapping** - Correctly categorizes scripts/tools by phase (test, build, lint, format, etc.)
4. **Instruction Coverage** - Validates that repository instructions document mandatory feedback loops
5. **Suggestion Generation** - Provides helpful suggestions for missing documentation
6. **Package Manager Detection** - Uses the correct package manager (npm, yarn, pnpm) in suggestions
7. **Edge Cases** - Handles utility scripts without false positives

## Running the Tests

### Standard Run

```bash
npm test -- --config vitest.integration.config.ts src/use-cases/feedback-loop-discovery.integration.test.ts
```

### With Output Inspection

To see detailed output of what the tools discover and suggest:

```bash
INSPECT_OUTPUT=1 npm test -- --config vitest.integration.config.ts src/use-cases/feedback-loop-discovery.integration.test.ts --reporter=verbose
```

This will display:
- All discovered scripts with their phases and mandatory flags
- All discovered tools from workflows
- Coverage summary (percentages, missing items)
- Generated suggestions for improving instruction coverage

## Test Scenarios

### 1. Complete JavaScript/TypeScript Project

Creates a realistic project with:
- Multiple test scripts (test, test:watch, test:integration)
- Build, lint, and format scripts
- Development and utility scripts
- GitHub Actions workflow
- Partial instruction coverage

**Validates:**
- All scripts are discovered
- Tools from workflows are extracted
- Package manager is detected
- Coverage is calculated correctly
- Suggestions are helpful

### 2. 100% Coverage

Creates a project where all mandatory scripts are documented.

**Validates:**
- Full coverage is reported
- Success message is generated
- No missing items

### 3. Package Manager Detection (Yarn)

Creates a yarn-based project with `yarn.lock`.

**Validates:**
- Suggestions use "yarn run" instead of "npm run"

### 4. Package Manager Detection (pnpm)

Creates a pnpm-based project with `pnpm-lock.yaml`.

**Validates:**
- Suggestions use "pnpm run" instead of "npm run"

### 5. Edge Cases - Utility Scripts

Creates scripts with names that could cause false positives:
- `test-utils` (should NOT match "test" phase)
- `build-tools` (should NOT match "build" phase)

**Validates:**
- Pattern matching requires colon separators
- Utility scripts are categorized as "unknown"

### 6. Empty Project

Tests graceful handling of projects with no scripts or workflows.

**Validates:**
- Returns empty arrays
- Doesn't crash or throw errors

## Example Inspection Output

When running with `INSPECT_OUTPUT=1`, you'll see output like:

```json
=== Discovery Result ===
{
  "scripts": [
    {
      "name": "test",
      "command": "vitest run",
      "phase": "test",
      "isMandatory": true
    },
    {
      "name": "build",
      "command": "rspack build",
      "phase": "build",
      "isMandatory": true
    }
  ],
  "tools": [
    {
      "name": "npm test",
      "fullCommand": "npm test",
      "phase": "test",
      "isMandatory": true,
      "sourceWorkflow": "ci.yml"
    }
  ],
  "packageManager": "npm"
}
========================

=== Coverage Result ===
{
  "hasFullCoverage": false,
  "summary": {
    "totalMandatory": 4,
    "totalDocumented": 2,
    "coveragePercentage": 50
  },
  "missing": [
    { "name": "lint", "phase": "lint" },
    { "name": "format", "phase": "format" }
  ],
  "suggestions": [
    "⚠️  2 mandatory feedback loop(s) are not documented:",
    "",
    "LINT phase:",
    "  - Document \"npm run lint\" (runs: biome check)",
    "",
    "FORMAT phase:",
    "  - Document \"npm run format\" (runs: prettier --write)",
    "",
    "Consider adding these to .github/copilot-instructions.md"
  ]
}
========================
```

## Manual Testing

You can use this test framework to manually inspect output for any project structure:

1. Modify the test to create your desired project structure
2. Run with `INSPECT_OUTPUT=1`
3. Review the JSON output to verify behavior

This is particularly useful when:
- Adding support for new package managers
- Improving phase detection logic
- Testing edge cases
- Debugging suggestion generation

## Integration with MCP Tools

These use cases are wrapped by MCP tools:
- `discover_feedback_loops` - Returns discovery results
- `validate_instruction_coverage` - Returns coverage analysis

The integration test validates the core business logic that these MCP tools expose to AI assistants.
