export const STOP_CAPTURE_TEMPLATE = `You have just finished a coding session. Before this context is lost, review your
recent work for findings worth capturing as durable lessons.

A lesson is worth capturing when:
- You discovered a project-specific invariant that wasn't obvious from the code
- You hit a recurring concern that future agents will likely encounter on similar files
- You corrected a mistake that future agents could easily repeat

Lessons live at \`.lousy-agents/lessons/<slug>.md\`. Each lesson is a markdown file
with YAML frontmatter conforming to this schema:

- \`slug\`: lowercase, digits, hyphens only (matches \`^[a-z0-9-]+$\`)
- \`title\`: one-line human-readable summary
- \`type\`: \`invariant\` (broad project rule) or \`pattern\` (file-specific concern)
- \`created\` / \`revised\`: YYYY-MM-DD; \`revised\` must be on or after \`created\`
- \`provenance\`: array of \`{ pr, finding_id, facet }\` (may be empty for in-session captures)
- \`triggers.paths\`: glob patterns (max 100 entries, max 200 chars each)
- \`triggers.tags\`: path-segment or extension matches (max 100, max 200 chars)
- \`triggers.patterns\`: literal substrings to match in file content (max 50, max 200 chars)

Before writing a new lesson:
1. List existing lessons under \`.lousy-agents/lessons/\` and read any whose slug or
   title looks related to your finding.
2. If an existing lesson covers your finding, update it (bump \`revised\`, append
   to \`provenance\`, refine triggers/body) rather than creating a duplicate.
3. Only create a new lesson if no existing lesson covers the finding.

Write or edit lessons using your normal Write/Edit tools. The capture command
will not create or modify files for you.
`;

export const SUBAGENT_STOP_CAPTURE_TEMPLATE = `You are a subagent finishing your task. Before your subagent context is lost,
capture findings local to your scope as durable lessons.

A lesson is worth capturing when:
- You discovered a project-specific invariant that wasn't obvious from the code
- You hit a recurring concern that future agents will likely encounter on similar files
- You corrected a mistake that future agents could easily repeat

Lessons live at \`.lousy-agents/lessons/<slug>.md\`. Each lesson is a markdown file
with YAML frontmatter conforming to this schema:

- \`slug\`: lowercase, digits, hyphens only (matches \`^[a-z0-9-]+$\`)
- \`title\`: one-line human-readable summary
- \`type\`: \`invariant\` (broad project rule) or \`pattern\` (file-specific concern)
- \`created\` / \`revised\`: YYYY-MM-DD; \`revised\` must be on or after \`created\`
- \`provenance\`: array of \`{ pr, finding_id, facet }\` (may be empty for in-session captures)
- \`triggers.paths\`: glob patterns (max 100 entries, max 200 chars each)
- \`triggers.tags\`: path-segment or extension matches (max 100, max 200 chars)
- \`triggers.patterns\`: literal substrings to match in file content (max 50, max 200 chars)

Before writing a new lesson:
1. List existing lessons under \`.lousy-agents/lessons/\` and read any whose slug or
   title looks related to your finding.
2. If an existing lesson covers your finding, update it (bump \`revised\`, append
   to \`provenance\`, refine triggers/body) rather than creating a duplicate.
3. Only create a new lesson if no existing lesson covers the finding.

Focus your review on findings specific to the work you completed in this
subagent invocation. The main agent will run its own capture pass on Stop and
will see broader session findings; do not duplicate that work.

Write or edit lessons using your normal Write/Edit tools. The capture command
will not create or modify files for you.
`;

export interface CapturePromptInput {
    hookEventName: "Stop" | "SubagentStop";
}

export interface CapturePromptOutput {
    prompt: string;
}

export function buildCapturePrompt(
    input: CapturePromptInput,
): CapturePromptOutput {
    const prompt =
        input.hookEventName === "SubagentStop"
            ? SUBAGENT_STOP_CAPTURE_TEMPLATE
            : STOP_CAPTURE_TEMPLATE;
    return { prompt };
}
