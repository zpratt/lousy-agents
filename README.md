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

# Generate GitHub Copilot setup workflow from your project configuration
npx lousy-agents copilot-setup
```

## Table of Contents

- [Who This Is For](#who-this-is-for)
- [Why This Exists](#why-this-exists)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Roadmap](#roadmap)
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

The `lousy-agents` CLI provides two main commands:

#### `init` - Project Scaffolding

Scaffolds new projects with everything needed for effective AI-assisted development:

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

#### `copilot-setup` - Workflow Generation

Analyzes your project and automatically generates a GitHub Actions workflow (`copilot-setup-steps.yml`) that configures the environment for GitHub Copilot:

- **Environment Detection**: Scans for mise.toml, .nvmrc, .python-version, and other version files
- **Workflow Analysis**: Parses existing workflows to identify setup actions already in use
- **Smart Merging**: Combines detected environment with existing workflow patterns
- **Incremental Updates**: Only adds missing setup steps to existing workflows
- **Zero Configuration**: Works out of the box for common project setups

This workflow ensures GitHub Copilot has the same environment context as your CI/CD pipelines, improving code suggestions and reducing hallucinations.

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

### Scaffolding Projects with `init`

#### Interactive Mode

Run the init command and select your project type from the menu:

```bash
npx lousy-agents init
```

You'll be prompted to choose from:
- CLI
- webapp
- REST API (coming soon)
- GraphQL API (coming soon)

#### Non-Interactive Mode

Specify the project type directly:

```bash
npx lousy-agents init --kind webapp
npx lousy-agents init --kind CLI
```

#### Help

```bash
npx lousy-agents --help
npx lousy-agents init --help
```

### Generating Copilot Workflows with `copilot-setup`

The `copilot-setup` command analyzes your project and generates a GitHub Actions workflow that sets up the environment for GitHub Copilot.

#### Basic Usage

Run from your project root:

```bash
npx lousy-agents copilot-setup
```

This will:
1. Detect environment configuration files (mise.toml, .nvmrc, .python-version, etc.)
2. Parse existing GitHub Actions workflows for setup actions
3. Generate or update `.github/workflows/copilot-setup-steps.yml`

#### What It Detects

**Version Files**:
- `.nvmrc`, `.node-version` → adds `actions/setup-node`
- `.python-version` → adds `actions/setup-python`
- `.ruby-version` → adds `ruby/setup-ruby`
- `.java-version` → adds `actions/setup-java`
- `.go-version` → adds `actions/setup-go`

**Tool Configuration**:
- `mise.toml` → adds `jdx/mise-action` (replaces individual setup actions)

**Existing Workflows**:
- Scans `.github/workflows/*.yml` for setup actions
- Preserves existing configuration

#### Examples

**Create workflow for Node.js project**:

```bash
# Project has .nvmrc
npx lousy-agents copilot-setup
# Creates workflow with actions/setup-node
```

**Create workflow for mise project**:

```bash
# Project has mise.toml
npx lousy-agents copilot-setup
# Creates workflow with jdx/mise-action
```

**Update existing workflow**:

```bash
# Already has copilot-setup-steps.yml
# Add .python-version file
npx lousy-agents copilot-setup
# Adds actions/setup-python to existing workflow
```

#### Help

```bash
npx lousy-agents copilot-setup --help
```

## Roadmap

| Feature | Status |
|---------|--------|
| Scaffolding for webapps | In Progress |
| Scaffolding for CLI | Not Started |
| Scaffolding for REST APIs | Not Started |
| Scaffolding for GraphQL APIs | Not Started |
| MCP server package | Not Started |

## Reference Example

The [ui/copilot-with-react](ui/copilot-with-react) directory contains a fully working reference implementation demonstrating these patterns in action. It's a Next.js + TypeScript project with:

- Pre-configured testing (Vitest) and linting (Biome)
- GitHub Copilot instructions and specs
- Dev Container configuration for GitHub Codespaces

Launch a GitHub Codespace to instantly spin up this environment and experiment with spec-driven development.
