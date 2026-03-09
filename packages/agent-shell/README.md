# agent-shell

A flight recorder for npm script execution.

agent-shell is an npm `script-shell` shim that independently records what scripts ran, who initiated them, and whether they succeeded — producing structured JSONL telemetry. It sits below the agent at the npm script-shell level, providing an audit trail that doesn't depend on agent self-reports.

## Quick Start

```bash
# Install as a dev dependency
npm install -D @lousy-agents/agent-shell

# Configure npm to use agent-shell as the script shell
echo 'script-shell=./node_modules/.bin/agent-shell' >> .npmrc

# Add event storage to .gitignore
echo '.agent-shell/' >> .gitignore

# Verify it's working
npx agent-shell --version

# Run any npm script — events are recorded automatically
npm test
```

## How It Works

When npm runs a script (e.g., `npm test`), it invokes the configured `script-shell` instead of `/bin/sh`. agent-shell wraps the real shell:

1. Captures context (actor, environment, timestamps)
2. Spawns `/bin/sh -c <command>` — your script runs normally
3. Records a JSONL event with execution metadata
4. Propagates the exit code unchanged

Scripts behave identically — same output, same exit codes, same signals. agent-shell adds observability without changing behavior.

## Telemetry Schema (v1)

Each script execution produces one JSON line:

```json
{
  "v": 1,
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "event": "script_end",
  "script": "test",
  "command": "vitest run",
  "package": "my-app",
  "package_version": "1.2.0",
  "actor": "claude-code",
  "exit_code": 1,
  "signal": null,
  "duration_ms": 3420,
  "timestamp": "2026-03-08T14:32:01.000Z",
  "env": {
    "NODE_ENV": "test",
    "CI": "true"
  },
  "tags": {
    "pr": "1234"
  }
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `v` | number | Schema version (always `1`) |
| `session_id` | string | UUID identifying the session |
| `event` | string | `script_end` or `shim_error` |
| `script` | string? | npm lifecycle event name (e.g., `test`, `build`) |
| `command` | string | The actual command executed |
| `package` | string? | Package name from `package.json` |
| `package_version` | string? | Package version |
| `actor` | string | Who initiated it: `human`, `ci`, `claude-code`, `copilot`, or custom |
| `exit_code` | number | Child process exit code |
| `signal` | string \| null | Signal name if killed (e.g., `SIGINT`), otherwise `null` |
| `duration_ms` | number | Wall-clock execution time in milliseconds |
| `timestamp` | string | ISO 8601 completion timestamp |
| `env` | object | Captured environment variables (allowlisted) |
| `tags` | object | Custom tags from `AGENTSHELL_TAG_*` variables |

Fields `script`, `package`, and `package_version` are only present when running within an npm context.

## Actor Detection

agent-shell classifies who initiated each script execution:

| Priority | Condition | Actor |
|----------|-----------|-------|
| 1 | `AGENTSHELL_ACTOR` is set | Value of the variable |
| 2 | `GITHUB_ACTIONS=true` | `ci` |
| 3 | `CLAUDE_CODE` is set | `claude-code` |
| 4 | `COPILOT_AGENT` is set | `copilot` |
| 5 | No match | `human` |

## Querying Events

Use the `log` subcommand to query execution history:

```bash
# Show events from the most recent session
agent-shell log

# Show events from the last 2 hours
agent-shell log --last 2h

# Show only failures
agent-shell log --failures

# Filter by actor
agent-shell log --actor claude-code

# Filter by script name
agent-shell log --script test

# Combine filters
agent-shell log --actor claude-code --failures --last 2h

# Output as JSON (for scripting)
agent-shell log --json

# List all sessions
agent-shell log --list-sessions
```

### Duration Formats

| Format | Meaning |
|--------|---------|
| `30m` | Last 30 minutes |
| `2h` | Last 2 hours |
| `1d` | Last 1 day |

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `AGENTSHELL_PASSTHROUGH` | Set to `1` to bypass all instrumentation | Unset (instrumentation active) |
| `AGENTSHELL_ACTOR` | Override automatic actor detection | Unset (heuristic detection) |
| `AGENTSHELL_SESSION_ID` | Shared session ID for event correlation | Unset (fresh UUID per invocation) |
| `AGENTSHELL_LOG_DIR` | Override event file directory | `.agent-shell/events/` |
| `AGENTSHELL_TAG_<key>` | Attach custom key=value metadata to events | None |

### Custom Tags

Set `AGENTSHELL_TAG_*` environment variables to attach metadata:

```bash
AGENTSHELL_TAG_pr=1234 AGENTSHELL_TAG_task=fix-auth npm test
```

Produces: `"tags": { "pr": "1234", "task": "fix-auth" }`

### Session Correlation

By default, each script invocation gets a fresh session ID. To correlate events across a workflow:

```bash
export AGENTSHELL_SESSION_ID=$(uuidgen)
npm run lint && npm test && npm run build
# All three events share the same session_id
```

## Scope

- **npm only** — Configured via `.npmrc` `script-shell`. Other package managers (yarn, pnpm, bun) are not supported.
- **POSIX only** — macOS and Linux. Windows requires WSL or Git Bash.

## Troubleshooting

### npm fails with "script-shell not found"

Your `.npmrc` references `agent-shell` but it's not installed:

```bash
# Fix: install the package
npm install -D @lousy-agents/agent-shell

# Or: bypass temporarily
AGENTSHELL_PASSTHROUGH=1 npm test
```

### Bypass all instrumentation

Set the passthrough escape hatch — zero overhead, zero recording:

```bash
AGENTSHELL_PASSTHROUGH=1 npm test
```

### Remove instrumentation entirely

Remove the `script-shell` line from `.npmrc`:

```bash
# Edit .npmrc and delete this line:
# script-shell=./node_modules/.bin/agent-shell

# Or remove it with sed:
sed -i '' '/script-shell/d' .npmrc
```

Then optionally uninstall:

```bash
npm uninstall @lousy-agents/agent-shell
```

### Verify the shim is active

```bash
npx agent-shell --version
```

### Clean up recorded events

```bash
rm -rf .agent-shell/
```

## .gitignore

Add `.agent-shell/` to your `.gitignore`:

```
# agent-shell telemetry
.agent-shell/
```
