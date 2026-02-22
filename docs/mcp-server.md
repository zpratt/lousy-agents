# MCP Server

Lousy Agents includes an MCP (Model Context Protocol) server that exposes workflow management tools to AI assistants like GitHub Copilot. This allows you to manage Copilot Setup Steps workflows directly from your AI assistant conversations.

## Available Tools

| Tool | Description |
| :--- | :--- |
| `discover_environment` | Detect environment configuration files (mise.toml, .nvmrc, .python-version, etc.) |
| `discover_workflow_setup_actions` | Find setup actions in existing GitHub Actions workflows |
| `discover_feedback_loops` | Discover package.json scripts and CLI tools, mapping them to SDLC feedback loop phases |
| `validate_instruction_coverage` | Validate that repository instructions document all mandatory feedback loop scripts and tools |
| `read_copilot_setup_workflow` | Read the current Copilot Setup Steps workflow |
| `create_copilot_setup_workflow` | Create or update the Copilot Setup Steps workflow with version resolution |
| `create_claude_code_web_setup` | Create or update Claude Code web environment setup (`.claude/settings.json` and `CLAUDE.md`) |
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

## Feedback Loop Discovery and Validation

The MCP server includes tools for discovering scripts and CLI tools that form SDLC feedback loops, and validating that repository instructions document these mandatory steps.

### Discovering Feedback Loops

The `discover_feedback_loops` tool analyzes your repository to find:

- **scripts from package.json**
- **CLI commands** from GitHub Actions workflows

Each script and tool is mapped to an SDLC phase (test, build, lint, format, security, deploy, etc.) and categorized as mandatory or optional.

**Response Format:**

```json
{
  "success": true,
  "summary": {
    "totalScripts": 8,
    "totalTools": 6,
    "mandatoryScripts": 4,
    "mandatoryTools": 2,
    "packageManager": "npm"
  },
  "scriptsByPhase": {
    "test": [
      { "name": "test", "command": "vitest run", "mandatory": true },
      { "name": "test:integration", "command": "vitest run --config vitest.integration.config.ts", "mandatory": true }
    ],
    "build": [
      { "name": "build", "command": "rspack build", "mandatory": true }
    ],
    "lint": [
      { "name": "lint", "command": "biome check .", "mandatory": true },
      { "name": "lint:fix", "command": "biome check --write .", "mandatory": true }
    ]
  },
  "toolsByPhase": {
    "test": [
      { "name": "npm test", "command": "npm test", "mandatory": true, "source": "ci.yml" }
    ],
    "lint": [
      { "name": "mise run lint", "command": "mise run lint", "mandatory": true, "source": "ci.yml" }
    ]
  }
}
```

### Validating Instruction Coverage

The `validate_instruction_coverage` tool checks if your repository instructions (`.github/copilot-instructions.md` and `.github/instructions/*.md`) document all mandatory feedback loops.

**Response Format:**

```json
{
  "success": true,
  "hasFullCoverage": false,
  "summary": {
    "totalMandatory": 6,
    "totalDocumented": 4,
    "coveragePercentage": 66.67
  },
  "missing": [
    {
      "type": "script",
      "name": "lint:fix",
      "phase": "lint",
      "command": "biome check --write ."
    },
    {
      "type": "tool",
      "name": "mise run build",
      "phase": "build",
      "command": "mise run build"
    }
  ],
  "documented": [
    { "type": "script", "name": "test", "phase": "test" },
    { "type": "script", "name": "build", "phase": "build" },
    { "type": "script", "name": "lint", "phase": "lint" },
    { "type": "tool", "name": "npm test", "phase": "test" }
  ],
  "suggestions": [
    "⚠️  2 mandatory feedback loop(s) are not documented:",
    "",
    "LINT phase:",
    "  - Document \"npm run lint:fix\" (runs: biome check --write .)",
    "",
    "BUILD phase:",
    "  - Document \"mise run build\"",
    "",
    "Consider adding these to .github/copilot-instructions.md",
    "or creating dedicated instruction files in .github/instructions/"
  ]
}
```

This helps ensure that AI agents have clear, consistent instructions for running feedback loops during development.

## Claude Code Web Environment Setup

The `create_claude_code_web_setup` tool automates configuration of Claude Code web environments by detecting your project's environment and generating:

- **`.claude/settings.json`** — SessionStart hooks that run automatically when a Claude Code session starts (e.g., `mise install`, `npm ci`)
- **`CLAUDE.md`** — Documentation of detected runtimes, package managers, and setup hooks

### How It Works

1. **Environment Detection**: Scans for `mise.toml`, `.nvmrc`, `.python-version`, and other version/dependency files
2. **Hook Generation**: Maps detected tools to appropriate install commands (`nvm install`, `pip install`, etc.)
3. **Settings Merge**: Preserves existing `.claude/settings.json` settings while adding or updating SessionStart hooks
4. **Documentation Merge**: Updates or creates the Environment Setup section in `CLAUDE.md`

### Response Format

```json
{
  "hooks": [
    { "command": "mise install", "description": "Install runtimes from mise.toml" },
    { "command": "npm ci", "description": "Install Node.js dependencies with package-lock.json" }
  ],
  "action": "created",
  "settingsPath": ".claude/settings.json",
  "documentationPath": "CLAUDE.md",
  "recommendations": [
    { "type": "network_access", "description": "Enable internet access in Claude Code environment settings to allow package installation" }
  ]
}
```

## VS Code Configuration

Add the following to your VS Code `mcp.json` configuration file (typically at `.vscode/mcp.json` or in your user settings):

```json
{
  "servers": {
    "lousy-agents": {
      "command": "npx",
      "args": ["-y", "-p", "@lousy-agents/cli", "lousy-agents-mcp"]
    }
  }
}
```

Or if you have `@lousy-agents/cli` installed locally in your project:

```json
{
  "servers": {
    "lousy-agents": {
      "command": "node",
      "args": ["./node_modules/@lousy-agents/cli/dist/mcp-server.js"]
    }
  }
}
```

## GitHub.com Hosted Copilot Coding Agent Configuration

To use this MCP server with the hosted GitHub Copilot coding agent on github.com, add the server in your MCP server settings using this copy/paste configuration:

```json
{
  "mcpServers": {
    "lousy-agents": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "@lousy-agents/cli@1.0.2", "lousy-agents-mcp"],
      "tools": ["*"]
    }
  }
}
```

> Update the pinned `@lousy-agents/cli@1.0.2` version when you intentionally upgrade to a newer release.

### Steps to update MCP server settings on github.com

1. Sign in to github.com and open your account **Settings**.
2. Go to **Copilot** settings, then open **Coding agent** settings.
3. Open the **MCP servers** section and choose **Edit** (or **Add server** if none exist yet).
4. Paste the JSON block above into the MCP server settings editor.
5. Save changes, then start a new hosted Copilot coding agent session so it loads the updated MCP server list.

## Usage Examples

Once configured, you can ask your AI assistant to:

- "Discover what environment configuration files are in this project"
- "Create a Copilot Setup Steps workflow for this repository"
- "What setup actions are used in my existing workflows?"
- "Analyze the action versions in my GitHub workflows"
- "Discover the scripts and tools used in this project's SDLC feedback loops"
- "Check if the repository instructions document all mandatory feedback loops"
- "Show me which test and build commands are defined in package.json and workflows"
- "Set up Claude Code environment for this project"
- "Update the Claude Code SessionStart hooks based on my project configuration"

## Architecture

The MCP server runs as a separate process that your AI assistant communicates with. It provides a structured way for AI assistants to:

1. Query your project's environment configuration
2. Read and analyze existing workflows
3. Generate or update Copilot Setup Steps workflows
4. Verify action versions across your repository
5. Discover scripts and CLI tools used in SDLC feedback loops
6. Validate instruction coverage for mandatory feedback loop steps
7. Generate Claude Code web environment setup (SessionStart hooks and documentation)

This enables more intelligent and context-aware assistance when working with GitHub Actions, project configuration, and ensuring that agents follow consistent feedback loops during development.
