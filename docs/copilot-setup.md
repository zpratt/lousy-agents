# `copilot-setup` Command

Analyzes your project and automatically generates a GitHub Actions workflow (`copilot-setup-steps.yml`) that configures the environment for GitHub Copilot.

## Features

- **Environment Detection**: Scans for mise.toml, .nvmrc, .python-version, and other version files
- **Workflow Analysis**: Parses existing workflows to identify setup actions already in use
- **Smart Merging**: Combines detected environment with existing workflow patterns
- **Incremental Updates**: Only adds missing setup steps to existing workflows
- **Zero Configuration**: Works out of the box for common project setups

This workflow ensures GitHub Copilot has the same environment context as your CI/CD pipelines, improving code suggestions and reducing hallucinations.

## Usage

### Basic Usage

Run from your project root:

```bash
npx @zpratt/lousy-agents copilot-setup
```

This will:

1. Detect environment configuration files (mise.toml, .nvmrc, .python-version, etc.)
2. Parse existing GitHub Actions workflows for setup actions
3. Generate or update `.github/workflows/copilot-setup-steps.yml`

### What It Detects

**Version Files**:

- `.nvmrc`, `.node-version` → adds `actions/setup-node`
- `.python-version` → adds `actions/setup-python`
- `.ruby-version` → adds `actions/setup-ruby`
- `.java-version` → adds `actions/setup-java`
- `.go-version` → adds `actions/setup-go`

**Tool Configuration**:

- `mise.toml` → adds `jdx/mise-action` (replaces individual setup actions)

**Existing Workflows**:

- Scans `.github/workflows/*.yml` for setup actions
- Preserves existing configuration

## Examples

### Create Workflow for Node.js Project

```bash
# Project has .nvmrc
npx @zpratt/lousy-agents copilot-setup
# Creates workflow with actions/setup-node
```

### Create Workflow for mise Project

```bash
# Project has mise.toml
npx @zpratt/lousy-agents copilot-setup
# Creates workflow with jdx/mise-action
```

### Update Existing Workflow

```bash
# Already has copilot-setup-steps.yml
# Add .python-version file
npx @zpratt/lousy-agents copilot-setup
# Adds actions/setup-python to existing workflow
```

## Help

```bash
npx @zpratt/lousy-agents copilot-setup --help
```

## Generated Workflow Example

When you run `copilot-setup` on a Node.js project with `.nvmrc`, it generates:

```yaml
---
name: Copilot Setup Steps
on:
  workflow_dispatch: {}
  push:
    branches:
      - main
    paths:
      - .github/workflows/copilot-setup-steps.yml
  pull_request:
    branches:
      - main
    paths:
      - .github/workflows/copilot-setup-steps.yml
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup node
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
```
