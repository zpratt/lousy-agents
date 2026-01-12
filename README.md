# Lousy Agents

**Turn "lousy" AI outputs into production-grade code.**

![Demo](media/demo.gif)

Lousy Agents is a CLI scaffolding tool that sets up your projects with the structure, instructions, and feedback loops that AI coding assistants need to be effective. One command gives you a production-ready development environment with testing, linting, and AI assistant configuration.

## Quick Start

```bash
# Scaffold a new webapp project (no install required)
npx lousy-agents init --kind webapp

# Or use interactive mode to choose your project type
npx lousy-agents init
```

## Table of Contents

- [Who This Is For](#who-this-is-for)
- [Why This Exists](#why-this-exists)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Roadmap](#roadmap)
- [MCP Server](#mcp-server)
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

### CLI Scaffolding Tool

The `lousy-agents` CLI scaffolds new projects with everything needed for effective AI-assisted development:

**Webapp Projects** (`--kind webapp`):
- Next.js + React + TypeScript configuration
- Vitest testing setup with React Testing Library
- Biome linting and formatting
- GitHub Copilot instructions tailored for webapp development
- VSCode configuration with recommended extensions
- Dev Container setup for one-click environments
- EditorConfig and Node.js version management

**CLI Projects** (`--kind CLI`):
- `.github/instructions` directory structure
- GitHub Copilot instructions for CLI development

### Spec-Driven Development

A methodology where you write clear specifications *first*, giving agents precise requirements to implement—rather than vague prompts. Each scaffolded project includes instruction files for writing specs and tests.

### Non-Interactive Mode

Use the `--kind` flag to skip prompts and integrate into scripts or automation:

```bash
npx lousy-agents init --kind webapp  # No prompts, perfect for CI/CD
```

## Installation

No installation required! Use npx to run directly:

```bash
npx lousy-agents init
```

For frequent use, install globally:

```bash
npm install -g lousy-agents
```

## Usage

### Interactive Mode

Run the init command and select your project type from the menu:

```bash
npx lousy-agents init
```

You'll be prompted to choose from:
- CLI
- webapp
- REST API (coming soon)
- GraphQL API (coming soon)

### Non-Interactive Mode

Specify the project type directly:

```bash
npx lousy-agents init --kind webapp
npx lousy-agents init --kind CLI
```

### Help

```bash
npx lousy-agents --help
npx lousy-agents init --help
```

## Roadmap

| Feature | Status |
|---------|--------|
| Scaffolding for webapps | In Progress |
| Scaffolding for CLI | Not Started |
| Scaffolding for REST APIs | Not Started |
| Scaffolding for GraphQL APIs | Not Started |
| MCP server package | ✅ Complete |

## MCP Server

Lousy Agents includes an MCP (Model Context Protocol) server that exposes workflow management tools to AI assistants like GitHub Copilot. This allows you to manage Copilot Setup Steps workflows directly from your AI assistant conversations.

### Available Tools

| Tool | Description |
|------|-------------|
| `discover_environment` | Detect environment configuration files (mise.toml, .nvmrc, .python-version, etc.) |
| `discover_workflow_setup_actions` | Find setup actions in existing GitHub Actions workflows |
| `read_copilot_setup_workflow` | Read the current Copilot Setup Steps workflow |
| `create_copilot_setup_workflow` | Create or update the Copilot Setup Steps workflow |
| `analyze_action_versions` | Analyze GitHub Action versions across all workflows |

### VS Code Configuration

Add the following to your VS Code `mcp.json` configuration file (typically at `.vscode/mcp.json` or in your user settings):

```json
{
  "servers": {
    "lousy-agents": {
      "command": "npx",
      "args": ["lousy-agents-mcp"]
    }
  }
}
```

Or if you have lousy-agents installed locally:

```json
{
  "servers": {
    "lousy-agents": {
      "command": "node",
      "args": ["./node_modules/lousy-agents/dist/mcp-server.js"]
    }
  }
}
```

Once configured, you can ask your AI assistant to:

- "Discover what environment configuration files are in this project"
- "Create a Copilot Setup Steps workflow for this repository"
- "What setup actions are used in my existing workflows?"
- "Analyze the action versions in my GitHub workflows"

## Reference Example

The [ui/copilot-with-react](ui/copilot-with-react) directory contains a fully working reference implementation demonstrating these patterns in action. It's a Next.js + TypeScript project with:

- Pre-configured testing (Vitest) and linting (Biome)
- GitHub Copilot instructions and specs
- Dev Container configuration for GitHub Codespaces

Launch a GitHub Codespace to instantly spin up this environment and experiment with spec-driven development.
