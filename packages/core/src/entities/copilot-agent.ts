/**
 * Core domain entity for GitHub Copilot custom agent files.
 * Handles name normalization and content generation.
 */

/**
 * Normalizes an agent name to lowercase with hyphens.
 * Handles spaces, mixed case, multiple spaces, and leading/trailing spaces.
 */
export function normalizeAgentName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Generates the markdown content for a custom Copilot agent file.
 * Includes YAML frontmatter, documentation link, and example structure.
 */
export function generateAgentContent(agentName: string): string {
    const normalizedName = normalizeAgentName(agentName);

    return `---
name: ${normalizedName}
description: Brief description of what this agent does
---

<!-- 
This is a custom GitHub Copilot agent for repository-level use.
Learn more: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents
-->

# ${normalizedName} Agent

You are a ${normalizedName} agent specialized in {domain/responsibility}.

## Your Role

{Brief description of the agent's expertise and focus area}

## Responsibilities

- {Primary responsibility}
- {Secondary responsibility}
- {Additional responsibility}

## Guidelines

- {Guideline or best practice}
- {Guideline or best practice}
- {Guideline or best practice}

## Example Interactions

{Example of how the agent should respond to typical requests}
`;
}
