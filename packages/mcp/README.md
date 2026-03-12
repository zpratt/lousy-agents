# @lousy-agents/mcp

Model Context Protocol (MCP) server for Lousy Agents.

Use this package when you want MCP clients such as VS Code or hosted GitHub Copilot to call Lousy Agents workflow, instruction, and environment-analysis tools.

## Quick Start

Run the published MCP server without installing it permanently:

```bash
npx -y -p @lousy-agents/mcp lousy-agents-mcp
```

## VS Code

Add the server to `.vscode/mcp.json`:

```json
{
  "servers": {
    "lousy-agents": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "@lousy-agents/mcp", "lousy-agents-mcp"]
    }
  }
}
```

## Documentation

- Project overview: [README](https://github.com/zpratt/lousy-agents#readme)
- MCP server guide: [`docs/mcp-server.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/mcp-server.md)
