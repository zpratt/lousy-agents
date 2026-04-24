#!/usr/bin/env bash
set -euo pipefail

# renovate: datasource=github-releases depName=dolthub/dolt
DOLT_VERSION="1.86.5"
# renovate: datasource=github-releases depName=steveyegge/beads
BEADS_VERSION="1.0.2"

# Trust config files first (before any mise commands that read config)
mise trust --all --yes
mise install --yes --locked

# Install dolt (required by beads)
# Detect architecture for platform-specific binary
DOLT_ARCH=""
case "$(uname -m)" in
  x86_64|amd64)
    DOLT_ARCH="amd64"
    ;;
  aarch64|arm64)
    DOLT_ARCH="arm64"
    ;;
  *)
    echo "Error: Unsupported architecture for Dolt: $(uname -m)" >&2
    exit 1
    ;;
esac

DOLT_DIR="/tmp/dolt-linux-${DOLT_ARCH}"
curl -fsSL "https://github.com/dolthub/dolt/releases/download/v${DOLT_VERSION}/dolt-linux-${DOLT_ARCH}.tar.gz" -o /tmp/dolt.tar.gz
tar xzf /tmp/dolt.tar.gz -C /tmp
sudo install -m 755 "${DOLT_DIR}/bin/dolt" /usr/local/bin/dolt
rm -rf /tmp/dolt.tar.gz "${DOLT_DIR}"

# Install beads (task tracking CLI)
if ! curl -fsSL "https://raw.githubusercontent.com/steveyegge/beads/v${BEADS_VERSION}/scripts/install.sh" | bash; then
  echo "Error: Failed to install beads (bd). Devcontainer setup cannot continue." >&2
  exit 1
fi

# Verify beads CLI is available
if ! command -v bd >/dev/null 2>&1; then
  echo "Error: beads CLI 'bd' not found on PATH after installation. Devcontainer setup cannot continue." >&2
  exit 1
fi

npm ci

claude mcp add --transport stdio context7 npx @upstash/context7-mcp
claude mcp add --transport stdio sequential-thinking npx @modelcontextprotocol/server-sequential-thinking
