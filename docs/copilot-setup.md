# `copilot-setup` Command

Analyzes your project and automatically generates a GitHub Actions workflow (`copilot-setup-steps.yml`) that configures the environment for GitHub Copilot. It also checks for and optionally creates a Copilot PR review ruleset.

## Features

- **Environment Detection**: Scans for mise.toml, .nvmrc, .python-version, and other version files
- **Workflow Analysis**: Parses existing workflows to identify setup actions already in use
- **Smart Merging**: Combines detected environment with existing workflow patterns
- **Incremental Updates**: Only adds missing setup steps to existing workflows
- **Package Manager Detection**: Detects lockfiles and adds dependency install steps
- **PR Review Ruleset**: Checks for and creates Copilot PR review rulesets with code scanning rules based on your repository's security configuration
- **Zero Configuration**: Works out of the box for common project setups

This workflow ensures GitHub Copilot has the same environment context as your CI/CD pipelines, improving code suggestions and reducing hallucinations.

## Usage

### Basic Usage

Run from your project root:

```bash
npx @lousy-agents/cli copilot-setup
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

**Package Managers**:

- `package-lock.json` → adds `npm ci`
- `yarn.lock` → adds `yarn install --frozen-lockfile`
- `pnpm-lock.yaml` → adds `pnpm install --frozen-lockfile`
- `requirements.txt` → adds `pip install -r requirements.txt`
- `Pipfile.lock` → adds `pipenv install --deploy`
- `poetry.lock` → adds `poetry install --no-root`
- `Gemfile.lock` → adds `bundle install`

## Examples

### Create Workflow for Node.js Project

```bash
# Project has .nvmrc
npx @lousy-agents/cli copilot-setup
# Creates workflow with actions/setup-node
```

### Create Workflow for mise Project

```bash
# Project has mise.toml
npx @lousy-agents/cli copilot-setup
# Creates workflow with jdx/mise-action
```

### Update Existing Workflow

```bash
# Already has copilot-setup-steps.yml
# Add .python-version file
npx @lousy-agents/cli copilot-setup
# Adds actions/setup-python to existing workflow
```

## Copilot PR Review Ruleset

After generating or updating the workflow, the command checks your repository for a Copilot PR review ruleset and offers to create one if none exists.

### What It Does

1. **Authenticates** with GitHub using `GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth token`
2. **Checks** if an active ruleset with Copilot code review or code scanning rules already exists
3. **Prompts** you to create a ruleset if none is found
4. **Detects** whether [GitHub Advanced Security (GHAS)](https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security) is enabled on your repository
5. **Creates** a ruleset tailored to your repository's security configuration

### Ruleset Behavior

The created ruleset always includes a **Copilot code review** rule that enables automated PR reviews. The inclusion of **code scanning** rules depends on whether GitHub Advanced Security is enabled:

| Repository Configuration | Ruleset Rules                                                       |
|--------------------------|----------------------------------------------------------------------|
| GHAS **not** enabled     | `copilot_code_review` only                                           |
| GHAS **enabled**         | `copilot_code_review` + `code_scanning` (CodeQL and Copilot Autofix) |

When GHAS is enabled, the code scanning rule includes:

- **CodeQL** — static analysis for security vulnerabilities
- **Copilot Autofix** — AI-powered security fix suggestions

### Authentication

Ruleset management requires a GitHub token with repository admin permissions. The command resolves tokens in this order:

1. `GH_TOKEN` environment variable
2. `GITHUB_TOKEN` environment variable
3. `gh auth token` CLI fallback

If no token is available, the command skips the ruleset check with a warning.

### Examples

```bash
# Set up with GitHub token
export GH_TOKEN=ghp_your_token_here
npx @lousy-agents/cli copilot-setup
```

When prompted:

```
No Copilot PR review ruleset found. Would you like to create one? (y/n)
```

Answering `y` creates the ruleset. The command reports what was created:

```
✓ Created Copilot PR review ruleset: "Copilot Code Review"
```

## Help

```bash
npx @lousy-agents/cli copilot-setup --help
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

> **Note:** The generated workflow uses version tags (e.g., `@v4`). For production use, consider pinning actions to exact commit SHAs for security. The [MCP server](mcp-server.md) `create_copilot_setup_workflow` tool supports automatic SHA-pinned version resolution.
