# Lousy Agents

**Turn "lousy" AI outputs into production-grade code.**

![Demo](media/demo.gif)

## TL;DR

Lousy Agents is a set of published npm packages for agentic software development, with `@lousy-agents/cli` as the main entry point. Run `npx @lousy-agents/cli init` to create a new project with testing, linting, and GitHub Copilot configuration. Run `npx @lousy-agents/cli copilot-setup` in existing projects to generate a workflow that gives Copilot your environment context. Add `@lousy-agents/mcp` for MCP integrations and `@lousy-agents/agent-shell` for npm script telemetry when you need them.

---

Lousy Agents is an npm workspace monorepo that publishes focused packages for scaffolding, MCP integrations, and npm script telemetry. The CLI package gives you a production-ready development environment with testing, linting, and AI assistant configuration in one command.

## Quick Start

```bash
# Scaffold a new webapp project (no install required)
npx @lousy-agents/cli init --kind webapp

# Or use interactive mode to choose your project type
npx @lousy-agents/cli init

# Generate GitHub Copilot setup workflow from your project configuration
npx @lousy-agents/cli copilot-setup
```

## Table of Contents

- [Start Here](#start-here)
- [Who This Is For](#who-this-is-for)
- [Why This Exists](#why-this-exists)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Reference Examples](#reference-examples)

## Start Here

If you're adopting Lousy Agents for the first time, use this order:

1. **Scaffold a project** with `npx @lousy-agents/cli init`
2. **Add repository-specific setup** with `npx @lousy-agents/cli copilot-setup`
3. **Add deeper integrations only if you need them**:
   - `@lousy-agents/mcp` for MCP clients like VS Code and hosted Copilot
   - `@lousy-agents/agent-shell` for npm script telemetry

Lousy Agents is an npm workspace monorepo. Most users only need one published package at a time:

| Package | Install / Run | Use it when |
|---------|----------------|-------------|
| `@lousy-agents/cli` | `npx @lousy-agents/cli init` | You want the scaffolding CLI for new or existing projects |
| `@lousy-agents/mcp` | `npx -y -p @lousy-agents/mcp lousy-agents-mcp` | You want Lousy Agents tools available through an MCP client |
| `@lousy-agents/agent-shell` | `npm install -g @lousy-agents/agent-shell` | You want an audit trail for npm script execution |

## Who This Is For

- **Software Engineers**: Frustrated by inconsistent AI output and looking for proven patterns to improve results.
- **Curious Beginners**: Interested in AI-assisted coding but unsure how to set things up for success.
- **Team Leads**: Exploring how to standardize AI tooling across a team or project.
- **Platform Engineers**: Need to automate project scaffolding in scripts or CI/CD pipelines.

No prior experience with coding agents is required—just curiosity and a willingness to experiment.

## Why This Exists

AI coding assistants work best when given clear constraints. Without structure, they guess—and often guess wrong. Lousy Agents provides the scaffolding they need to succeed:

- **Instructions & Specs**: Templates that clearly communicate your intent, so agents produce code that matches your vision.
- **Feedback Loops**: Pre-configured testing ([Vitest](https://vitest.dev/)) and linting ([Biome](https://biomejs.dev/)) that let agents catch and fix their own mistakes immediately.
- **Copilot Configuration**: Settings and workflows that ground AI assistants in your specific engineering standards.

## Features

### CLI Commands

- **[`init`](docs/init.md)** - Scaffold new projects with testing, linting, and Copilot configuration
- **[`new`](docs/new.md)** - Create new resources like custom GitHub Copilot agents
- **[`lint`](docs/lint.md)** - Validate skills, agents, and instruction files
- **[`copilot-setup`](docs/copilot-setup.md)** - Generate GitHub Actions workflows for Copilot environment setup

### MCP Server

- **[MCP Server](docs/mcp-server.md)** - Model Context Protocol server for AI assistant integration

### Companion Tools

- **[agent-shell](packages/agent-shell/README.md)** - A flight recorder for npm script execution. Records independent telemetry of what scripts ran, who initiated them, and whether they succeeded.

![agent-shell demo](media/agent-shell.gif)

### Spec-Driven Development

A methodology where you write clear specifications *first*, giving agents precise requirements to implement—rather than vague prompts. Each scaffolded project includes instruction files for writing specs and tests.

### Non-Interactive Mode

Use the `--kind` flag to skip prompts and integrate into scripts or automation:

```bash
npx @lousy-agents/cli init --kind webapp  # No prompts, perfect for CI/CD
```

## Installation

Most users do not need to clone this repository. Start with the published package that matches your use case.

### `@lousy-agents/cli`

No installation required! Use npx to run directly:

```bash
npx @lousy-agents/cli init
```

For frequent use, install globally:

```bash
npm install -g @lousy-agents/cli
```

### `@lousy-agents/mcp`

Run the MCP server without installing it permanently:

```bash
npx -y -p @lousy-agents/mcp lousy-agents-mcp
```

### `@lousy-agents/agent-shell`

Install agent-shell globally (required — npm needs the shim on `PATH` before `npm install` runs):

```bash
npm install -g @lousy-agents/agent-shell
```

## Usage

For detailed documentation on each command, see:

- **[`init` command](docs/init.md)** - Scaffold new projects
- **[`new` command](docs/new.md)** - Create new resources
- **[`lint` command](docs/lint.md)** - Validate skills, agents, and instruction files
- **[`copilot-setup` command](docs/copilot-setup.md)** - Generate Copilot workflows
- **[MCP Server](docs/mcp-server.md)** - AI assistant integration

### Quick Examples

**Create a new webapp:**

```bash
npx @lousy-agents/cli init --kind webapp
```

**Create a custom Copilot agent:**

```bash
npx @lousy-agents/cli new --copilot-agent security
```

**Generate Copilot setup workflow:**

```bash
npx @lousy-agents/cli copilot-setup
```

**Lint skills, agents, and instructions:**

```bash
npx @lousy-agents/cli lint
```

## Contributing

This repository is an npm workspace monorepo with packages for the CLI, MCP server, core logic, GitHub Action integration, and agent-shell.

```bash
npm install
mise run ci && npm run build
```

Use the root install to work on all workspace packages together. The root `npm run build` command builds the publishable packages: `packages/cli`, `packages/mcp`, and `packages/agent-shell`.

## Roadmap

| Feature | Status |
|---------|--------|
| Scaffolding for webapps | ✅ Complete |
| Scaffolding for REST APIs | ✅ Complete |
| Scaffolding for CLI | ✅ Complete |
| Scaffolding for GraphQL APIs | Not Started |
| Copilot setup package manager install steps | ✅ Complete |
| Copilot agent and skill scaffolding | ✅ Complete |
| Agent skill frontmatter linting | ✅ Complete |
| Agent and instruction quality linting | ✅ Complete |
| MCP server package | ✅ Complete |
| Claude Code web environment setup | ✅ Complete |

## Documentation

- **[Start with `init`](docs/init.md)** - Scaffold a project with the CLI
- **[Then `copilot-setup`](docs/copilot-setup.md)** - Generate workflow setup for existing repositories
- **[`new` Command](docs/new.md)** - Create new resources after your scaffold is in place
- **[`lint` Command](docs/lint.md)** - Validate skills, agents, and instruction files
- **[MCP Server](docs/mcp-server.md)** - Configure the separately published `@lousy-agents/mcp` package
- **[agent-shell](packages/agent-shell/README.md)** - Add npm script execution telemetry

## Reference Examples

The repository includes fully working reference implementations in the CLI workspace:

- **[packages/cli/ui/copilot-with-react](packages/cli/ui/copilot-with-react)** - Next.js + TypeScript webapp with pre-configured testing (Vitest), linting (Biome), GitHub Copilot instructions, and Dev Container configuration.
- **[packages/cli/api/copilot-with-fastify](packages/cli/api/copilot-with-fastify)** - Fastify + TypeScript REST API with Kysely, PostgreSQL, Testcontainers integration testing, and Dev Container configuration.
- **[packages/cli/cli/copilot-with-citty](packages/cli/cli/copilot-with-citty)** - Citty + TypeScript CLI with pre-configured testing (Vitest), linting (Biome), GitHub Copilot instructions, and Dev Container configuration.

Launch a GitHub Codespace to instantly spin up any of these environments and experiment with spec-driven development.
