# Lousy Agents

**Turn "lousy" AI outputs into production-grade code.**

![Demo](media/demo.gif)

## TL;DR

A CLI tool that scaffolds projects with the structure AI coding assistants need to be effective. Run `npx @lousy-agents/cli init` to create a new project with testing, linting, and GitHub Copilot configuration. Run `npx @lousy-agents/cli copilot-setup` in existing projects to generate a workflow that gives Copilot your environment context.

---

Lousy Agents is a CLI scaffolding tool that sets up your projects with the structure, instructions, and feedback loops that AI coding assistants need to be effective. One command gives you a production-ready development environment with testing, linting, and AI assistant configuration.

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

- [Who This Is For](#who-this-is-for)
- [Why This Exists](#why-this-exists)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Reference Examples](#reference-examples)

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
- **[`copilot-setup`](docs/copilot-setup.md)** - Generate GitHub Actions workflows for Copilot environment setup

### MCP Server

- **[MCP Server](docs/mcp-server.md)** - Model Context Protocol server for AI assistant integration

### Spec-Driven Development

A methodology where you write clear specifications *first*, giving agents precise requirements to implement—rather than vague prompts. Each scaffolded project includes instruction files for writing specs and tests.

### Non-Interactive Mode

Use the `--kind` flag to skip prompts and integrate into scripts or automation:

```bash
npx @lousy-agents/cli init --kind webapp  # No prompts, perfect for CI/CD
```

## Installation

No installation required! Use npx to run directly:

```bash
npx @lousy-agents/cli init
```

For frequent use, install globally:

```bash
npm install -g @lousy-agents/cli
```

## Usage

For detailed documentation on each command, see:

- **[`init` command](docs/init.md)** - Scaffold new projects
- **[`new` command](docs/new.md)** - Create new resources
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

## Roadmap

| Feature | Status |
|---------|--------|
| Scaffolding for webapps | ✅ Complete |
| Scaffolding for REST APIs | ✅ Complete |
| Scaffolding for CLI | Not Started |
| Scaffolding for GraphQL APIs | Not Started |
| MCP server package | ✅ Complete |

## Documentation

- **[`init` Command](docs/init.md)** - Project scaffolding
- **[`new` Command](docs/new.md)** - Create new resources
- **[`copilot-setup` Command](docs/copilot-setup.md)** - Workflow generation
- **[MCP Server](docs/mcp-server.md)** - AI assistant integration

## Reference Examples

The repository includes fully working reference implementations demonstrating these patterns in action:

- **[ui/copilot-with-react](ui/copilot-with-react)** - Next.js + TypeScript webapp with pre-configured testing (Vitest), linting (Biome), GitHub Copilot instructions, and Dev Container configuration.
- **[api/copilot-with-fastify](api/copilot-with-fastify)** - Fastify + TypeScript REST API with Kysely, PostgreSQL, Testcontainers integration testing, and Dev Container configuration.

Launch a GitHub Codespace to instantly spin up either environment and experiment with spec-driven development.
