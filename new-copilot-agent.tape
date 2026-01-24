# VHS documentation: https://github.com/charmbracelet/vhs

# Set up the terminal appearance
Output media/new-copilot-agent.gif
Set FontSize 14
Set Width 1200
Set Height 600
Set Theme "Catppuccin Mocha"
Set PlaybackSpeed 0.5
Set TypingSpeed 100ms

# Create demo directory and show it's empty
Type "mkdir -p demo && cd demo"
Enter
Sleep 1s
Type "ls -la"
Enter
Sleep 1s

# Demo: Create a custom Copilot agent
Type "# Create a custom GitHub Copilot agent"
Enter
Sleep 500ms
Type "npx lousy-agents new --copilot-agent security"
Enter
Sleep 3s

# Show what was created
Type "ls -la .github/agents/"
Enter
Sleep 2s

# Show the content of the created agent file
Type "cat .github/agents/security.md"
Enter
Sleep 5s

# Create another agent with multi-word name
Type "# Create an agent with a multi-word name"
Enter
Sleep 500ms
Type "npx lousy-agents new --copilot-agent 'code review'"
Enter
Sleep 3s

# Show the normalized filename
Type "ls -la .github/agents/"
Enter
Sleep 2s

# Show help for the new command
Type "# View help for the new command"
Enter
Sleep 500ms
Type "npx lousy-agents new --help"
Enter
Sleep 3s

# Hold the final frame
Sleep 2s
