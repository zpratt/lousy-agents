# VHS documentation: https://github.com/charmbracelet/vhs

# Set up the terminal appearance
Output media/demo.gif
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

# Demo 1: Interactive mode
Type "# Interactive mode - select from menu"
Enter
Sleep 500ms
Type "npx lousy-agents init"
Enter
Sleep 3s

# Select webapp option
Down
Enter
Sleep 2s

# Show the generated file structure
Type "tree -L 2 -a"
Enter
Sleep 3s

# Clean up for next demo
Type "cd .. && rm -rf demo && mkdir demo && cd demo"
Enter
Sleep 1s

# Demo 2: Non-interactive mode with --kind flag
Type "# Non-interactive mode - use --kind flag"
Enter
Sleep 500ms
Type "npx lousy-agents init --kind webapp"
Enter
Sleep 3s

# Show the generated file structure
Type "tree -L 2 -a"
Enter
Sleep 3s

# Demo 3: copilot-setup command - detect and generate workflow
Type "cd .. && rm -rf demo && mkdir demo && cd demo"
Enter
Sleep 1s

Type "# Demo: Generate Copilot setup workflow"
Enter
Sleep 500ms

# Create a sample project with .nvmrc (using Node 22 LTS)
Type "echo '22.11.0' > .nvmrc"
Enter
Sleep 500ms

Type "mkdir -p .github/workflows"
Enter
Sleep 500ms

# Show what we have
Type "ls -la"
Enter
Sleep 2s

# Run copilot-setup
Type "npx lousy-agents copilot-setup"
Enter
Sleep 3s

# Show the generated workflow
Type "cat .github/workflows/copilot-setup-steps.yml"
Enter
Sleep 5s

# Hold the final frame
Sleep 2s
