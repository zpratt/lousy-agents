# VHS documentation: https://github.com/charmbracelet/vhs

# Set up the terminal appearance
Output media/demo.gif
Set FontSize 14
Set Width 1200
Set Height 600
Set Theme "Catppuccin Mocha"
Set PlaybackSpeed 0.5
Set TypingSpeed 100ms

# Show the command
Type "mkdir -p demo && cd demo"
Enter
Type "ls -l"
Enter
Sleep 1s

# Run lousy-agents init
Type "npx lousy-agents init"
Enter
Sleep 3s

# Select webapp option (assuming it's an interactive prompt)
# Adjust the arrow keys/selection based on actual prompt behavior
Down
Enter
Sleep 2s

# Show the generated file structure
Type "tree -L 2 -a"
Enter
Sleep 3s

# Hold the final frame
Sleep 2s
