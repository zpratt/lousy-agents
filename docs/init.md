# `init` Command

Scaffolds new projects with everything needed for effective AI-assisted development.

## Table of Contents

- [Features](#features)
  - [Webapp Projects](#webapp-projects---kind-webapp)
  - [CLI Projects](#cli-projects---kind-cli)
  - [REST API Projects](#rest-api-projects---kind-api)
- [Usage](#usage)
  - [Interactive Mode](#interactive-mode)
  - [Non-Interactive Mode](#non-interactive-mode)
  - [Help](#help)
- [Examples](#examples)

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

### CLI Projects (`--kind cli`) — coming soon

- `.github/instructions` directory structure
- GitHub Copilot instructions for CLI development

> **Note:** CLI scaffolding is not yet implemented. Selecting `cli` will return an error.

### REST API Projects (`--kind api`)

- Fastify + TypeScript configuration
- Kysely for type-safe database queries with PostgreSQL
- Vitest testing setup with separate integration test config
- Testcontainers for integration testing with real PostgreSQL
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
- CI workflow with lint, test, and build jobs
- VSCode configuration with:
  - Recommended extensions (including Docker extension)
  - Debug launch config
  - MCP servers configuration (context7, sequential-thinking, lousy-agents)
- Dev Container setup with:
  - Pre-installed tools (GitHub CLI, actionlint, shellcheck, yamllint)
  - MCP servers pre-cached (context7-mcp, sequential-thinking)
  - Docker-outside-of-docker support
  - Port forwarding for API server (3000) and PostgreSQL (5432)
- EditorConfig and Node.js version management

## Options

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--kind` | `webapp \| api \| cli \| graphql` | No | Project type. If omitted, an interactive prompt is shown. |
| `--name` | `string` | No | Project name (used in package.json and config files). If omitted, you will be prompted. Must be a valid npm package name. |

## Usage

### Interactive Mode

Run the init command and select your project type from the menu:

```bash
npx @lousy-agents/cli init
```

You'll be prompted to choose from:

- webapp
- api (REST API with Fastify)
- cli (coming soon)
- graphql (coming soon)

### Non-Interactive Mode

Specify the project type and name directly:

```bash
npx @lousy-agents/cli init --kind webapp --name my-webapp
npx @lousy-agents/cli init --kind api --name my-rest-api
```

When both `--kind` and `--name` are provided, all prompts are skipped. Perfect for CI/CD pipelines and automation scripts.

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
npx @lousy-agents/cli init --kind webapp --name my-webapp
```

### Create a New REST API

```bash
npx @lousy-agents/cli init --kind api --name my-rest-api
```
