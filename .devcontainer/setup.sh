#!/usr/bin/env bash
set -euo pipefail

# Trust config files first (before any mise commands that read config)
mise trust --all --yes
mise install --yes --locked

npm ci

claude mcp add --transport stdio context7 npx @upstash/context7-mcp
claude mcp add --transport stdio sequential-thinking npx @modelcontextprotocol/server-sequential-thinking
