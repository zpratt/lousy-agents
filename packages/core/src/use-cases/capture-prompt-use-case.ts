export const STOP_CAPTURE_TEMPLATE = `## Lesson Capture Template

This session has ended. Review the conversation and capture any lessons learned.

### Instructions

1. Identify patterns or invariants that should be remembered for future sessions.
2. For each lesson, create a file in \`.lousy-agents/lessons/\` with the following frontmatter:

\`\`\`markdown
---
slug: <kebab-case-identifier>
title: <Short descriptive title>
type: invariant  # or "pattern"
created: <YYYY-MM-DD>
revised: <YYYY-MM-DD>
provenance: []
triggers:
  tags: []
  paths: []
  patterns: []
---

<Lesson body — describe the rule, pattern, or invariant clearly.>
\`\`\`

3. Run \`npx lousy-agents lint lessons\` to validate the lesson files.
`;

export const SUBAGENT_STOP_CAPTURE_TEMPLATE = `## Lesson Capture Template (Subagent)

This subagent session has ended. Review the work done and capture any lessons learned.

### Instructions

1. Identify patterns or invariants from this subagent's work that should be remembered.
2. For each lesson, create a file in \`.lousy-agents/lessons/\` with the following frontmatter:

\`\`\`markdown
---
slug: <kebab-case-identifier>
title: <Short descriptive title>
type: invariant  # or "pattern"
created: <YYYY-MM-DD>
revised: <YYYY-MM-DD>
provenance: []
triggers:
  tags: []
  paths: []
  patterns: []
---

<Lesson body — describe the rule, pattern, or invariant clearly.>
\`\`\`

3. Run \`npx lousy-agents lint lessons\` to validate the lesson files.
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
