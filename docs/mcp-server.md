# MCP Server

Lousy Agents includes an MCP (Model Context Protocol) server that exposes workflow management tools to AI assistants like GitHub Copilot. This allows you to manage Copilot Setup Steps workflows directly from your AI assistant conversations.

## Available Tools

| Tool | Description |
|------|-------------|
| `discover_environment` | Detect environment configuration files (mise.toml, .nvmrc, .python-version, etc.) |
| `discover_workflow_setup_actions` | Find setup actions in existing GitHub Actions workflows |
| `read_copilot_setup_workflow` | Read the current Copilot Setup Steps workflow |
| `create_copilot_setup_workflow` | Create or update the Copilot Setup Steps workflow |
| `analyze_action_versions` | Analyze GitHub Action versions across all workflows |

## VS Code Configuration

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

## Usage Examples

Once configured, you can ask your AI assistant to:

- "Discover what environment configuration files are in this project"
- "Create a Copilot Setup Steps workflow for this repository"
- "What setup actions are used in my existing workflows?"
- "Analyze the action versions in my GitHub workflows"

## How It Works

The MCP server runs as a separate process that your AI assistant communicates with. It provides a structured way for AI assistants to:

1. Query your project's environment configuration
2. Read and analyze existing workflows
3. Generate or update Copilot Setup Steps workflows
4. Verify action versions across your repository

This enables more intelligent and context-aware assistance when working with GitHub Actions and project configuration.
