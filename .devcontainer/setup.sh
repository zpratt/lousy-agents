#!/usr/bin/env bash
set -euo pipefail

# renovate: datasource=github-releases depName=dolthub/dolt
DOLT_VERSION="1.83.8"
# renovate: datasource=github-releases depName=steveyegge/beads
BEADS_VERSION="0.61.0"

mise trust -a
mise install

# Install dolt (required by beads)
curl -fsSL "https://github.com/dolthub/dolt/releases/download/v${DOLT_VERSION}/dolt-linux-amd64.tar.gz" -o /tmp/dolt.tar.gz
tar xzf /tmp/dolt.tar.gz -C /tmp
sudo install -m 755 /tmp/dolt-linux-amd64/bin/dolt /usr/local/bin/dolt
rm -rf /tmp/dolt.tar.gz /tmp/dolt-linux-amd64

# Install beads (task tracking CLI)
curl -fsSL "https://raw.githubusercontent.com/steveyegge/beads/v${BEADS_VERSION}/scripts/install.sh" | bash || true

npm ci
