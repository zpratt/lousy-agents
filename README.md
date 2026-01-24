# Lousy Agents

**Turn "lousy" AI outputs into production-grade code.**

![Demo](media/demo.gif)

## TL;DR

A CLI tool that scaffolds projects with the structure AI coding assistants need to be effective. Run `npx @zpratt/lousy-agents init` to create a new project with testing, linting, and GitHub Copilot configuration. Run `npx @zpratt/lousy-agents copilot-setup` in existing projects to generate a workflow that gives Copilot your environment context.

---

Lousy Agents is a CLI scaffolding tool that sets up your projects with the structure, instructions, and feedback loops that AI coding assistants need to be effective. One command gives you a production-ready development environment with testing, linting, and AI assistant configuration.

## Quick Start

```bash
# Scaffold a new webapp project (no install required)
npx @zpratt/lousy-agents init --kind webapp

# Or use interactive mode to choose your project type
npx @zpratt/lousy-agents init

# Generate GitHub Copilot setup workflow from your project configuration
npx @zpratt/lousy-agents copilot-setup
```

## Table of Contents

- [Who This Is For](#who-this-is-for)
- [Why This Exists](#why-this-exists)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Reference Example](#reference-example)

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
npx @zpratt/lousy-agents init --kind webapp  # No prompts, perfect for CI/CD
```

## Installation

No installation required! Use npx to run directly:

```bash
npx @zpratt/lousy-agents init
```

For frequent use, install globally:

```bash
npm install -g @zpratt/lousy-agents
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
npx lousy-agents init --kind webapp
```

**Create a custom Copilot agent:**

```bash
npx lousy-agents new --copilot-agent security
```

**Generate Copilot setup workflow:**

```bash
npx lousy-agents copilot-setup
```

## Roadmap

| Feature | Status |
|---------|--------|
| Scaffolding for webapps | In Progress |
| Scaffolding for CLI | Not Started |
| Scaffolding for REST APIs | Not Started |
| Scaffolding for GraphQL APIs | Not Started |
| MCP server package | ✅ Complete |

## Documentation

- **[`init` Command](docs/init.md)** - Project scaffolding
- **[`new` Command](docs/new.md)** - Create new resources
- **[`copilot-setup` Command](docs/copilot-setup.md)** - Workflow generation
- **[MCP Server](docs/mcp-server.md)** - AI assistant integration

## Reference Example

The [ui/copilot-with-react](ui/copilot-with-react) directory contains a fully working reference implementation demonstrating these patterns in action. It's a Next.js + TypeScript project with:

- Pre-configured testing (Vitest) and linting (Biome)
- GitHub Copilot instructions and specs
- Dev Container configuration for GitHub Codespaces

Launch a GitHub Codespace to instantly spin up this environment and experiment with spec-driven development.
