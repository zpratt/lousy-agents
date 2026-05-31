#!/bin/bash
# Cloud-only: prepend mise shims to PATH so the agent's non-interactive shell resolves
# the correct Node version. Skipped on local sessions where nvm manages Node instead.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
echo "PATH=/mise/shims:$PATH" >> "$CLAUDE_ENV_FILE"
