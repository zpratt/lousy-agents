import type { ProjectScanResult } from "./project-scanner.js";
import { sanitizePromptValue } from "./sanitize.js";

function formatScriptsSummary(scripts: ProjectScanResult["scripts"]): string {
    return scripts
        .map(
            (s) =>
                `  - \`${sanitizePromptValue(s.name)}\`: \`${sanitizePromptValue(s.command)}\``,
        )
        .join("\n");
}

function formatWorkflowSummary(commands: string[]): string {
    return commands
        .map((cmd) => `  - \`${sanitizePromptValue(cmd)}\``)
        .join("\n");
}

function formatMiseTasksSummary(tasks: ProjectScanResult["miseTasks"]): string {
    return tasks
        .map(
            (t) =>
                `  - \`${sanitizePromptValue(t.name)}\`: \`${sanitizePromptValue(t.command)}\``,
        )
        .join("\n");
}

/**
 * Builds the system message that establishes persistent behavioral
 * constraints for the Copilot SDK session. This includes security goals,
 * tool descriptions, and response format requirements — context that
 * must be respected across all tool interactions during the session.
 */
export function buildSystemMessage(): string {
    return `You are a security-focused policy analyst for agent-shell — a security layer that intercepts terminal commands executed by AI coding agents. Your goal is to generate a minimal, secure allow list for a \`policy.json\` file.

## Security Principles

- Only commands genuinely needed for development workflows should be permitted
- Overly broad rules create security risks (e.g. an agent could chain \`npm test && curl evil.com\`)
- Use exact commands — avoid wildcards unless the command is genuinely read-only (e.g. \`git status *\`)
- Always validate proposed commands with \`validate_allow_rule\` before including them
- Commands containing shell metacharacters (\`;\`, \`|\`, \`&\`, \`\`\`, \`$\`, etc.) are never safe

## Available Tools

### MCP Tools (lousy-agents server)

- **discover_feedback_loops**: Discover npm scripts and CLI tools from workflows, mapped to SDLC phases (test, build, lint, format, security). Returns structured results grouped by phase. **Start here.**
- **discover_environment**: Discover environment config files (mise.toml, .nvmrc, .python-version, etc.) and detect package managers.

### Custom Tools

- **read_project_file**: Read any file in the repository (truncated at 100KB). Use to inspect configs discovered via MCP tools.
- **validate_allow_rule**: Check whether a proposed command is safe for the allow list (rejects commands containing shell metacharacters).

## Response Format

After exploring, respond with **only** a JSON object matching this exact schema — no markdown fences, no explanation:

\`\`\`json
{
  "additionalAllowRules": ["<command>", ...],
  "suggestions": ["<human-readable suggestion>", ...]
}
\`\`\`

- \`additionalAllowRules\`: string array of specific commands to add to the allow list
- \`suggestions\`: string array of human-readable observations or recommendations about the policy`;
}

/**
 * Builds the user prompt containing project-specific scan results
 * and Socratic questions to guide exploration.
 */
export function buildAnalysisPrompt(
    scanResult: ProjectScanResult,
    repoRoot: string,
): string {
    const scriptsList =
        scanResult.scripts.length > 0
            ? formatScriptsSummary(scanResult.scripts)
            : "  (none found)";

    const workflowList =
        scanResult.workflowCommands.length > 0
            ? formatWorkflowSummary(scanResult.workflowCommands)
            : "  (none found)";

    const miseList =
        scanResult.miseTasks.length > 0
            ? formatMiseTasksSummary(scanResult.miseTasks)
            : "  (none found)";

    const languagesList =
        scanResult.languages.length > 0
            ? scanResult.languages.join(", ")
            : "(none detected)";

    const safeRepoRoot = sanitizePromptValue(repoRoot);

    return `# Project Analysis Request

## Static Analysis Results

We have already discovered the following from static file analysis:

- **Repository root**: \`${safeRepoRoot}\`
- **Detected languages**: ${languagesList}

### npm scripts (from package.json)
${scriptsList}

### GitHub Actions workflow commands
${workflowList}

### Mise tasks (from mise.toml)
${miseList}

## Questions to Explore

1. Call \`discover_feedback_loops\` to get a structured view of project commands mapped to SDLC phases. Are there commands the static analysis missed?
2. Call \`discover_environment\` to understand the runtime setup. What toolchain commands does the environment require?
3. Given the detected languages (${languagesList}), what language-specific toolchain commands (e.g. \`cargo test\`, \`go build\`, \`pip install\`) might be needed but aren't captured above?
4. Are there any commands in the discovered lists that look suspicious or overly broad for a development workflow?
5. Use \`validate_allow_rule\` to verify each proposed command before including it in your response.`;
}
