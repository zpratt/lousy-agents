# Lousy Agents Documentation

Welcome to the Lousy Agents documentation! This directory contains detailed documentation for all commands and features.

## Table of Contents

### Commands

- **[`init` Command](init.md)** - Scaffold new projects with testing, linting, and Copilot configuration
  - Project types (webapp, api, cli)
  - Interactive and non-interactive modes
  - Usage examples

- **[`new` Command](new.md)** - Create new resources like custom GitHub Copilot agents
  - Custom Copilot agents
  - Agent skills
  - Agent file structure
  - Usage examples

- **[`lint` Command](lint.md)** - Validate skills, agents, hook configurations, and instruction files
  - Skill and agent frontmatter validation
  - Hook configuration validation for Copilot and Claude Code
  - Instruction quality analysis (structural context, execution clarity, loop completeness)
  - Multiple output formats (human, JSON, reviewdog)
  - CI integration

- **[`copilot-setup` Command](copilot-setup.md)** - Generate GitHub Actions workflows for Copilot environment setup
  - Environment detection
  - Workflow analysis and merging
  - Usage examples and generated workflow samples

### Features

- **[MCP Server](mcp-server.md)** - Model Context Protocol server for AI assistant integration
  - Available tools
  - VS Code configuration
  - Usage examples

## Getting Started

If you're new to Lousy Agents, start with the main [README](../README.md) for the package overview and quick start.

Recommended reading order for new users:

1. [README](../README.md) — decide which published package you need
2. [init](init.md) — scaffold your first project
3. [copilot-setup](copilot-setup.md) — add GitHub Copilot environment setup to an existing repository
4. [new](new.md) and [lint](lint.md) — extend and validate your project scaffolding
5. [MCP Server](mcp-server.md) — add the separately published `@lousy-agents/mcp` package if you want MCP integration

## Command Reference

### `init`

The `init` command scaffolds new projects with everything needed for effective AI-assisted development. See the [complete init documentation](init.md) for:

- Supported project types
- Interactive vs non-interactive modes
- Configuration options
- Examples

### `new`

The `new` command creates new resources for your project. See the [complete new documentation](new.md) for:

- Creating custom GitHub Copilot agents
- Agent file structure and customization
- Naming conventions
- Examples

### `lint`

The `lint` command validates skills, agents, hook configurations, and instruction files. See the [complete lint documentation](lint.md) for:

- Skill and agent frontmatter validation
- Hook configuration validation for Copilot and Claude Code
- Instruction quality analysis
- Target flags (`--skills`, `--agents`, `--hooks`, `--instructions`)
- Output formats (`--format human|json|rdjsonl`)
- CI integration

### `copilot-setup`

The `copilot-setup` command analyzes your project and generates GitHub Actions workflows that configure the environment for GitHub Copilot. See the [complete copilot-setup documentation](copilot-setup.md) for:

- Environment detection capabilities
- Workflow analysis and merging
- Dry-run mode for previewing changes
- Version file support
- Generated workflow examples
- Copilot PR review ruleset creation (with GHAS-aware code scanning)

### MCP Server

The MCP (Model Context Protocol) server exposes workflow management tools to AI assistants. See the [complete MCP server documentation](mcp-server.md) for:

- Available tools and their capabilities
- Configuration instructions
- Integration examples

## Additional Resources

- [Main README](../README.md) - Project overview and quick start
- [GitHub Repository](https://github.com/zpratt/lousy-agents) - Source code and issues
