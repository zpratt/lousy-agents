# VHS documentation: https://github.com/charmbracelet/vhs

Output media/agent-shell.gif
Set FontSize 14
Set Width 1200
Set Height 650
Set Theme "Catppuccin Mocha"
Set PlaybackSpeed 0.75
Set TypingSpeed 80ms

# ── Setup (hidden) ────────────────────────────────────────────────────────────
Hide

Type "REPO=$(git rev-parse --show-toplevel)"
Enter
Sleep 500ms

Type "cd $REPO && npm run build -w packages/agent-shell --quiet 2>/dev/null"
Enter
Sleep 10s

Type "DEMO=/tmp/agent-shell-demo && rm -rf $DEMO && mkdir -p $DEMO && cd $DEMO"
Enter
Sleep 500ms

Type "cp $REPO/packages/agent-shell/demo/package.json ."
Enter
Sleep 300ms

Type "mkdir -p node_modules/.bin"
Enter
Type "ln -sf $REPO/packages/agent-shell/dist/index.js node_modules/.bin/agent-shell"
Enter
Type "chmod +x node_modules/.bin/agent-shell"
Enter
Type "printf 'script-shell=./node_modules/.bin/agent-shell\n' > .npmrc"
Enter
Type "printf '.agent-shell/\n' > .gitignore"
Enter
Type "export PATH=\"$DEMO/node_modules/.bin:$PATH\""
Enter
Sleep 300ms

Type "clear"
Enter
Sleep 200ms

Show
# ── Demo ─────────────────────────────────────────────────────────────────────

# Scene 1: Project context
Type "# agent-shell: a flight recorder for npm script execution"
Enter
Sleep 500ms
Type "cat .npmrc"
Enter
Sleep 1500ms

Type "agent-shell --version"
Enter
Sleep 1500ms

# Scene 2: Simulate an AI coding agent running scripts
Type "# Simulate an AI coding agent running npm scripts..."
Enter
Sleep 800ms

Type "CLAUDE_CODE=1 npm test"
Enter
Sleep 2500ms

Type "CLAUDE_CODE=1 npm run build"
Enter
Sleep 2000ms

Type "CLAUDE_CODE=1 npm run test:e2e"
Enter
Sleep 2500ms

# Scene 3: Human picks up the work
Type "# Back in your terminal — you run the tests too"
Enter
Sleep 800ms

Type "npm test"
Enter
Sleep 2500ms

# Scene 4: Review the full picture
Type "# Review what ran over the last hour"
Enter
Sleep 800ms

Type "agent-shell log --last 1h"
Enter
Sleep 2500ms

Type "# Filter by actor — see only what the agent ran"
Enter
Sleep 800ms

Type "agent-shell log --actor claude-code --last 1h"
Enter
Sleep 2500ms

Type "# Find failures fast"
Enter
Sleep 800ms

Type "agent-shell log --failures --last 1h"
Enter
Sleep 2500ms

# Hold the final frame
Sleep 2s
