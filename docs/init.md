# `init` Command

Scaffolds new projects with everything needed for effective AI-assisted development.

## Features

### Webapp Projects (`--kind webapp`)

- Next.js + React + TypeScript configuration
- Vitest testing setup with React Testing Library
- Biome linting and formatting
- yamllint configuration for YAML file linting
- GitHub Copilot instructions (`.github/instructions/`) for:
  - Pipeline workflows
  - Software architecture
  - Specifications
  - Testing standards
- Spec-driven development workflow:
  - Issue template for Copilot-powered feature specs
  - Auto-assignment workflow to assign Copilot on `copilot-ready` labeled issues
  - Specs directory with structured specification format
  - Copilot setup steps workflow
- VSCode configuration with recommended extensions and debug launch config
- Dev Container setup with:
  - Pre-installed tools (GitHub CLI, actionlint, shellcheck, yamllint)
  - MCP servers pre-cached (context7-mcp, sequential-thinking)
  - Docker-outside-of-docker support
- EditorConfig and Node.js version management

### CLI Projects (`--kind CLI`)

- `.github/instructions` directory structure
- GitHub Copilot instructions for CLI development

## Usage

### Interactive Mode

Run the init command and select your project type from the menu:

```bash
npx @lousy-agents/cli init
```

You'll be prompted to choose from:

- CLI
- webapp
- REST API (coming soon)
- GraphQL API (coming soon)

### Non-Interactive Mode

Specify the project type directly:

```bash
npx @lousy-agents/cli init --kind webapp
npx @lousy-agents/cli init --kind CLI
```

Perfect for CI/CD pipelines and automation scripts.

### Help

```bash
npx @lousy-agents/cli --help
npx @lousy-agents/cli init --help
```

## Examples

### Create a New Webapp

```bash
# Interactive mode - select from menu
npx @lousy-agents/cli init

# Non-interactive mode
npx @lousy-agents/cli init --kind webapp
```

### Create a New CLI Project

```bash
npx @lousy-agents/cli init --kind CLI
```
