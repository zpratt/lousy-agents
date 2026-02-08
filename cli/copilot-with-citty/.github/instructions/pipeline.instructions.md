---
applyTo: ".github/workflows/*.{yml,yaml}"
---

# Pipeline Instructions for CLI

## MANDATORY: After Modifying Workflows

Run these validation commands in order:

```bash
npm run lint:workflows  # Validate GitHub Actions workflows with actionlint
npm run lint:yaml       # Validate YAML syntax with yamllint
```

## Workflow Structure Requirements

1. Every workflow MUST include test and lint jobs.
2. Reference Node.js version from `.nvmrc` using `actions/setup-node` with `node-version-file` input.
3. Use official setup actions: `actions/checkout`, `actions/setup-node`, `actions/cache`.

## Action Pinning Format

Pin ALL third-party actions to exact commit SHA with version comment:

```yaml
# CORRECT format:
uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1

# INCORRECT formats (do NOT use):
uses: actions/checkout@v4        # ❌ version tag only
uses: actions/checkout@v4.1.1    # ❌ version tag only
uses: actions/checkout@main      # ❌ branch reference
```

Before adding any action:
1. Check GitHub for the LATEST stable version
2. Find the full commit SHA for that version
3. Add both SHA and version comment

## Runner Requirements

| Workflow | Runner |
|----------|--------|
| Default (all workflows) | `ubuntu-latest` |

## Example CI Workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020  # v4.4.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npx biome check

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020  # v4.4.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020  # v4.4.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
```
