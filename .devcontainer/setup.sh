#!/usr/bin/env bash
set -euo pipefail

mise trust -a
mise install

# Install dolt v1.83.8 (required by beads)
curl -fsSL https://github.com/dolthub/dolt/releases/download/v1.83.8/dolt-linux-amd64.tar.gz -o /tmp/dolt.tar.gz
tar xzf /tmp/dolt.tar.gz -C /tmp
sudo install -m 755 /tmp/dolt-linux-amd64/bin/dolt /usr/local/bin/dolt
rm -rf /tmp/dolt.tar.gz /tmp/dolt-linux-amd64

# Install beads (task tracking CLI)
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/v0.61.0/scripts/install.sh | bash || true

npm ci
