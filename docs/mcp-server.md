# MCP Server

Lousy Agents includes an MCP (Model Context Protocol) server that exposes workflow management tools to AI assistants like GitHub Copilot. This allows you to manage Copilot Setup Steps workflows directly from your AI assistant conversations.

## Available Tools

| Tool | Description |
| :--- | :--- |
| `discover_environment` | Detect environment configuration files (mise.toml, .nvmrc, .python-version, etc.) |
| `discover_workflow_setup_actions` | Find setup actions in existing GitHub Actions workflows |
| `read_copilot_setup_workflow` | Read the current Copilot Setup Steps workflow |
| `create_copilot_setup_workflow` | Create or update the Copilot Setup Steps workflow with version resolution |
| `analyze_action_versions` | Analyze GitHub Action versions across all workflows |
| `resolve_action_versions` | Get version resolution metadata for GitHub Actions (standalone tool) |

## Version Resolution

The MCP server supports dynamic version resolution for GitHub Actions. When creating or updating workflows, the tools return metadata that enables AI assistants to look up and pin actions to their latest SHA versions for security.

### How It Works

1. **Placeholder Mode**: When creating workflows, actions use `RESOLVE_VERSION` placeholders
2. **Resolution Metadata**: The response includes an `actionsToResolve` array with lookup URLs
3. **SHA Pinning**: After resolving versions, call the tool again with `resolvedVersions` to generate SHA-pinned actions

### Response Format

```json
{
  "success": true,
  "action": "created",
  "workflowPath": ".github/workflows/copilot-setup-steps.yml",
  "workflowTemplate": "...",
  "actionsToResolve": [
    {
      "action": "actions/setup-node",
      "currentPlaceholder": "RESOLVE_VERSION",
      "lookupUrl": "https://github.com/actions/setup-node/releases/latest"
    }
  ],
  "instructions": "To resolve action versions: ..."
}
```

### Resolving Versions

After looking up the latest versions, call the tool with resolved versions:

```json
{
  "targetDir": "/path/to/project",
  "resolvedVersions": [
    {
      "action": "actions/checkout",
      "sha": "692973e3d937129bcbf40652eb9f2f61becf3332",
      "versionTag": "v4.2.2"
    },
    {
      "action": "actions/setup-node",
      "sha": "1e60f620b9541d16bece96c5465dc8ee9832be0b",
      "versionTag": "v4.0.4"
    }
  ]
}
```

The final workflow will use SHA-pinned action references with version comments for maintainability:

```yaml
steps:
  - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332  # v4.2.2
  - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b  # v4.0.4
```

## VS Code Configuration

Add the following to your VS Code `mcp.json` configuration file (typically at `.vscode/mcp.json` or in your user settings):

```json
{
  "servers": {
    "lousy-agents": {
      "command": "npx",
      "args": ["-y", "-p", "@zpratt/lousy-agents", "lousy-agents-mcp"]
    }
  }
}
```

Or if you have `@zpratt/lousy-agents` installed locally in your project:

```json
{
  "servers": {
    "lousy-agents": {
      "command": "node",
      "args": ["./node_modules/@zpratt/lousy-agents/dist/mcp-server.js"]
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

## Architecture

The MCP server runs as a separate process that your AI assistant communicates with. It provides a structured way for AI assistants to:

1. Query your project's environment configuration
2. Read and analyze existing workflows
3. Generate or update Copilot Setup Steps workflows
4. Verify action versions across your repository

This enables more intelligent and context-aware assistance when working with GitHub Actions and project configuration.
