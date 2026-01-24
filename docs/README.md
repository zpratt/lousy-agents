# Lousy Agents Documentation

Welcome to the Lousy Agents documentation! This directory contains detailed documentation for all commands and features.

## Table of Contents

### Commands

- **[`init` Command](init.md)** - Scaffold new projects with testing, linting, and Copilot configuration
  - Project types (webapp, CLI)
  - Interactive and non-interactive modes
  - Usage examples

- **[`new` Command](new.md)** - Create new resources like custom GitHub Copilot agents
  - Custom Copilot agents
  - Agent file structure
  - Usage examples

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

If you're new to Lousy Agents, start with the main [README](../README.md) for a project overview and quick start guide.

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

### `copilot-setup`

The `copilot-setup` command analyzes your project and generates GitHub Actions workflows that configure the environment for GitHub Copilot. See the [complete copilot-setup documentation](copilot-setup.md) for:

- Environment detection capabilities
- Workflow analysis and merging
- Version file support
- Generated workflow examples

### MCP Server

The MCP (Model Context Protocol) server exposes workflow management tools to AI assistants. See the [complete MCP server documentation](mcp-server.md) for:

- Available tools and their capabilities
- Configuration instructions
- Integration examples

## Contributing

When adding new features or commands, please:

1. Create a dedicated documentation file in this directory
2. Update this README's table of contents
3. Link to the new documentation from the main README

## Additional Resources

- [Main README](../README.md) - Project overview and quick start
- [GitHub Repository](https://github.com/zpratt/lousy-agents) - Source code and issues
